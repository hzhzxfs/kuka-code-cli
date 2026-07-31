// 由 sdks/shared 契约镜像生成的 DTO；字段名 = wire camelCase，与 kuka-code / Python SDK 完全一致。

package kukacore.type;

import java.util.List;
import java.util.Map;

public record CreateSessionOptions(String sessionId, AgentMode agentMode, PermissionLevel permissionLevel) {
    public static Builder builder() { return new Builder(); }
    public static final class Builder {
        private String sessionId;
        private AgentMode agentMode;
        private PermissionLevel permissionLevel;
        private Builder() {}
        public Builder sessionId(String sessionId) { this.sessionId = sessionId; return this; }
        public Builder agentMode(AgentMode agentMode) { this.agentMode = agentMode; return this; }
        public Builder permissionLevel(PermissionLevel permissionLevel) { this.permissionLevel = permissionLevel; return this; }
        public CreateSessionOptions build() { return new CreateSessionOptions(sessionId, agentMode, permissionLevel); }
    }
}
