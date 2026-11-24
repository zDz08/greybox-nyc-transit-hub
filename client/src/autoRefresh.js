export function startAutoRefresh(tasks, intervalMs = 60000) {
    let stopped = false;
    let timerId;

    async function refresh() {
        if (stopped) return;

        const results = await Promise.allSettled(
            tasks.map(async (task) => {
                if (stopped) return;
                if (task.isEnabled && !task.isEnabled()) return;

                await task.run();
            })
        );

        if (stopped) return;

        results.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(
                    `Auto-refresh failed: ${tasks[index].name}`,
                    result.reason
                );
            }
        });

        timerId = setTimeout(refresh, intervalMs);
    }

    void refresh();

    return function stopAutoRefresh() {
        stopped = true;
        clearTimeout(timerId);
    };
}