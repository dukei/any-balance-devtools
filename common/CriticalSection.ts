type PromiseResolve = (value?: void | PromiseLike<void>) => void;

export default class CriticalSection {
    private _busy: boolean = false
    private _queue: PromiseResolve[] = []

    public enter(): Promise<void> {
        return new Promise(resolve => {
            this._queue.push(resolve);

            if (!this._busy) {
                this._busy = true;
                this._queue.shift()!();
            }
        });
    }

    public leave() {
        if (this._queue.length) {
            this._queue.shift()!();
        } else {
            this._busy = false;
        }
    }

    public async exclusive<T>(func: () => Promise<T>): Promise<T>{
        await this.enter();
        try{
            return await func();
        }finally {
            this.leave();
        }
    }
}