// 由 sdks/shared 契约镜像生成的 DTO；字段名 = wire camelCase，与 kuka-code / Python SDK 完全一致。
package kukacore.event;

public sealed interface PickOptionQuestion permits RadioQuestion, CheckboxQuestion, SelectQuestion, TextQuestion, TextareaQuestion {
    String type();
    String id();
    String label();
}
