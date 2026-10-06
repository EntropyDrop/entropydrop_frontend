/** Each operation owns a signal and may commit only while it is still current. */
export class LatestRequest {
    private controller: AbortController | null = null
    begin() {
        this.cancel()
        const controller = new AbortController()
        this.controller = controller
        return { signal: controller.signal, isCurrent: () => this.controller === controller && !controller.signal.aborted }
    }
    cancel() {
        this.controller?.abort()
        this.controller = null
    }
}
