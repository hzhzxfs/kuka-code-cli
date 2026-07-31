// 由 sdks/shared 契约镜像生成的 DTO；字段名 = wire camelCase，与 kuka-code / Python SDK 完全一致。

package kukacore.event;

import java.util.List;
import java.util.Map;

public record SessionReadyData(long pid, String workingDir, String sessionId, boolean historyLoaded, Usage usage, List<String> projectInputHistory, List<kukacore.type.TodoItem> todos, Map<String,Long> readFileTimestamps) {
}
