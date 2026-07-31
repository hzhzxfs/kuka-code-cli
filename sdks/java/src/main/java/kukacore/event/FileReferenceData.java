// 由 sdks/shared 契约镜像生成的 DTO；字段名 = wire camelCase，与 kuka-code / Python SDK 完全一致。

package kukacore.event;

import java.util.List;
import java.util.Map;

public record FileReferenceData(List<kukacore.type.FileReferenceInfo> references) {
}
