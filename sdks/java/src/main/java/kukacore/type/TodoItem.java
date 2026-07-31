// 由 sdks/shared 契约镜像生成的 DTO；字段名 = wire camelCase，与 kuka-code / Python SDK 完全一致。

package kukacore.type;

import java.util.List;
import java.util.Map;

public record TodoItem(String id, String title, TodoTaskStatus status, String progressText) {
}
