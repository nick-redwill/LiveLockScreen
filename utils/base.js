const _timeoutIds = new Set();

export function sleep(ms) {
    return new Promise(resolve => {
        const id = setTimeout(() => {
            _timeoutIds.delete(id);
            resolve();
        }, ms);
        _timeoutIds.add(id);
    });
}

//NOTE: Must be called in disable()
export function destroySleeps() {
    for (const id of _timeoutIds) {
        clearTimeout(id);
    }
    _timeoutIds.clear();
}