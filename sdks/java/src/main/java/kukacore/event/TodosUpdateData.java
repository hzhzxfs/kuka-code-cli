// 由 sdks/shared 契约镜像生成的 DTO；字段名 = wire camelCase，与 kuka-code / Python SDK 完全一致。
package kukacore.event;

import java.util.ArrayList;

/** todos:update 事件数据（≙ core TodosUpdateData = TodoItem[]）。 */
public final class TodosUpdateData extends ArrayList<kukacore.type.TodoItem> {}
