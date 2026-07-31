package kukacore.protocol;

/** 桥返回 error 帧、或连接中断导致指令失败时抛出。 */
public class KukaBridgeException extends RuntimeException {

    private final String action;

    public KukaBridgeException(String action, String message) {
        this(action, message, null);
    }

    public KukaBridgeException(String action, String message, Throwable cause) {
        super(action == null || action.isEmpty() ? message : "[" + action + "] " + message, cause);
        this.action = action;
    }

    /** 失败指令的 action 名；未知时为空字符串。 */
    public String action() {
        return action == null ? "" : action;
    }
}
