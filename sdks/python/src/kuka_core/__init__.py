"""kuka-code：kuka-code 的 Python SDK（gRPC 桥薄客户端，asyncio-first）。

导入布局对齐 Node（`pip install kuka-code` → `import kuka_core`，连字符→下划线为 Python 约束）：

    from kuka_core import KukaCore, KukaSession          # ≙ from 'kuka-code'
    from kuka_core.types import ModelConfig, CronTask     # ≙ from 'kuka-code/types'
    from kuka_core.event import TextChunkData, Usage      # ≙ from 'kuka-code/event'

用法：

    core = await KukaCore.start({"workingDir": project_dir})
    session = await core.create_session()
    session.on("message:text:chunk", lambda d: print(d["delta"], end=""))
    await session.process_user_input("你好")
    await core.close()
"""
from . import event, types
from . import events as KukaEvents
from .api import KukaCore, KukaSession
from .constants import MAIN_AGENT_ID, PROTOCOL_VERSION
from .protocol import Registration, KukaBridgeClient, KukaBridgeException
from .runtime import NodeProvider, SidecarManager, system_node_provider
from .transport import BridgeConnection, ConnectionState, KukaEvent

# 注：Fork* / InputImageAttachment 归 `kuka_core.types` 入口（不再从主包再导出）。

__all__ = [
    # 主 API
    "KukaCore", "KukaSession",
    # 子模块（≙ 'kuka-code/types'、'kuka-code/event'）与事件名常量
    "types", "event", "KukaEvents",
    # 常量
    "MAIN_AGENT_ID", "PROTOCOL_VERSION",
    # 协议 / 传输 / 运行时逃生口
    "KukaBridgeClient", "KukaBridgeException", "Registration",
    "BridgeConnection", "ConnectionState", "KukaEvent",
    "SidecarManager", "NodeProvider", "system_node_provider",
]
