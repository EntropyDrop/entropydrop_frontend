type Entry<T> = {
    promise: Promise<T>
    controller: AbortController
    consumers: number
    settled: boolean
    expires: number
    bytes: number
}

/** A caller can cancel its lease without cancelling another caller's request. */
export class SharedRequestCache<T> {
    private readonly entries = new Map<string, Entry<T>>()
    private bytes = 0
    private readonly sizeOf: (value: T) => number
    constructor(sizeOf: (value: T) => number) { this.sizeOf = sizeOf }

    get(key: string, ttlMs: number, load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
        if (signal?.aborted) return Promise.reject(signal.reason)
        let entry = this.entries.get(key)
        if (entry && (entry.controller.signal.aborted || (entry.settled && entry.expires <= Date.now()))) {
            this.remove(key, entry)
            entry = undefined
        }
        if (!entry) {
            const controller = new AbortController()
            const created: Entry<T> = { controller, consumers: 0, settled: false, expires: 0, bytes: 0,
                promise: Promise.resolve().then(() => load(controller.signal)).then(value => {
                    controller.signal.throwIfAborted()
                    created.settled = true
                    created.bytes = this.sizeOf(value)
                    created.expires = Date.now() + ttlMs
                    if (this.entries.get(key) === created) {
                        this.bytes += created.bytes
                        this.trim()
                    }
                    return value
                }).catch(error => { this.remove(key, created); throw error }),
            }
            entry = created
            this.entries.set(key, created)
        } else {
            this.entries.delete(key)
            this.entries.set(key, entry)
        }
        const current = entry
        current.consumers++
        return new Promise<T>((resolve, reject) => {
            let released = false
            const release = () => {
                if (released) return
                released = true
                signal?.removeEventListener('abort', abort)
                current.consumers--
                // StrictMode can reacquire in the same turn after its first cleanup.
                void Promise.resolve().then(() => {
                    if (!current.settled && current.consumers === 0) {
                        current.controller.abort()
                        this.remove(key, current)
                    }
                })
            }
            const abort = () => { release(); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')) }
            signal?.addEventListener('abort', abort, { once: true })
            current.promise.then(value => { if (!released) { release(); resolve(value) } },
                error => { if (!released) { release(); reject(error) } })
        })
    }

    clear() {
        for (const entry of this.entries.values()) if (!entry.settled) entry.controller.abort()
        this.entries.clear()
        this.bytes = 0
    }
    private remove(key: string, entry: Entry<T>) {
        if (this.entries.get(key) !== entry) return
        this.entries.delete(key)
        if (entry.settled) this.bytes -= entry.bytes
    }
    private trim() {
        for (const [key, entry] of this.entries) {
            if (this.entries.size <= 32 && this.bytes <= 2 * 1024 * 1024) break
            if (entry.settled) this.remove(key, entry)
        }
    }
}
