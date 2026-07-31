// 由 sdks/shared 契约镜像生成的 DTO；字段名 = wire camelCase，与 kuka-code / Python SDK 完全一致。

package kukacore.type;

import java.util.List;
import java.util.Map;

public record MCPServerInfo(MCPServerConfig config, MCPServerStatus connectStatus, boolean status, MCPServerCapabilities capabilities, Long connectedAt, String error, MCPScopeType scope, String filePath) {
}
