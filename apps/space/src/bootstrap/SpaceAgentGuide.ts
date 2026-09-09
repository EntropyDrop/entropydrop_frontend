export function spaceAgentConnection(apiOrigin: string) {
  const origin = new URL(apiOrigin).origin;
  return {
    origin,
    skillUrl: `${origin}/space/agent/SKILL.md`,
    spaceApiUrl: `${origin}/space/agent/spaceAPI.md`,
    entityApiUrl: `${origin}/space/agent/entityAPI.md`,
    positionUrl: `${origin}/space/api/v2/players/me/position`,
  };
}

export function spaceAgentPrompt(apiOrigin: string, zh = false): string {
  const { origin, skillUrl } = spaceAgentConnection(apiOrigin);
  const keysUrl = `${origin}/space/apikeys`;
  return zh
    ? `请先读取 ${skillUrl}，通过 spaceAPI 完成我的建造请求；实体代码使用 entityAPI。\n后端地址：${origin}\nAPI Key 获取页面：${keysUrl}\n\n请按以下流程开始：\n1. 检查你是否已拥有我的 spaceAPI Key；若未提供，请向我索取已有的 Key，或提示我访问 ${keysUrl} 创建后提供给你。\n2. 获得 Key 后，调用 spaceAPI 查询我在世界中的当前坐标（若返回位置过期或不可用，请提醒我进入在线世界刷新坐标）。\n3. 询问我想建造什么，随后规划体素并编写 entityAPI 控制脚本，通过 API 完成建造。\n现在请确认已就绪，并向我索取建造需求和 API Key。`
    : `Read ${skillUrl} first and use spaceAPI for my build request; entity code uses entityAPI.\nBackend URL: ${origin}\nAPI Keys Page: ${keysUrl}\n\nPlease follow this workflow:\n1. Check if you already have my spaceAPI key; if not provided yet, ask me for an existing key, or guide me to visit ${keysUrl} to create one and paste it to you.\n2. Once obtained, query my player position via spaceAPI (if stale or unavailable, ask me to enter the online world and retry).\n3. Ask what I want to build, plan voxels and write entityAPI controller code, and execute the build.\nPlease confirm you are ready, and ask me for my build request and API key.`;
}
