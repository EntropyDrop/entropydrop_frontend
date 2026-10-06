/** LRU for completed resources; pending work is deduplicated separately. */
type CacheOptions<T> = {
    maxEntries: number
    maxBytes: number
    ttlMs: number
    sizeOf: (value: T) => number
    now?: () => number
}

export class AsyncResourceCache<T> {
    private readonly completed = new Map<string, { value: T; bytes: number; expires: number }>()
    private readonly pending = new Map<string, Promise<T>>()
    private bytes = 0
    private readonly options: CacheOptions<T>

    constructor(options: CacheOptions<T>) { this.options = options }

    getOrLoad(key: string, load: () => Promise<T>): Promise<T> {
        const now = this.options.now ?? Date.now
        const cached = this.completed.get(key)
        if (cached) {
            this.completed.delete(key)
            if (cached.expires > now()) {
                this.completed.set(key, cached)
                return Promise.resolve(cached.value)
            }
            this.bytes -= cached.bytes
        }
        const pending = this.pending.get(key)
        if (pending) return pending

        const promise = Promise.resolve().then(load).then(value => {
            // clear() also invalidates work started by the previous session.
            if (this.pending.get(key) !== promise) return value
            this.pending.delete(key)
            const bytes = this.options.sizeOf(value)
            if (bytes > this.options.maxBytes) return value
            this.completed.set(key, { value, bytes, expires: now() + this.options.ttlMs })
            this.bytes += bytes
            while (this.completed.size > this.options.maxEntries || this.bytes > this.options.maxBytes) {
                const oldest = this.completed.entries().next().value
                if (!oldest) break
                this.completed.delete(oldest[0])
                this.bytes -= oldest[1].bytes
            }
            return value
        }, error => {
            if (this.pending.get(key) === promise) this.pending.delete(key)
            throw error
        })
        this.pending.set(key, promise)
        return promise
    }

    clear() {
        this.completed.clear()
        this.pending.clear()
        this.bytes = 0
    }
}
