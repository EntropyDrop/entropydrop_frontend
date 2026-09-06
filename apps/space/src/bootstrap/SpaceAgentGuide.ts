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
  return zh
    ? `请先读取 ${skillUrl}，通过 spaceAPI 完成我的建造请求；实体代码使用 entityAPI。\n后端地址：${origin}\nspaceAPI Key：<在此粘贴你的 API Key>\n任务：<描述你想建造的物体>\n先查询我的位置；如果位置过期或不可用，请提示我进入在线世界后重试。`
    : `Read ${skillUrl} first and use spaceAPI for my build request; entity code uses entityAPI.\nBackend URL: ${origin}\nspaceAPI key: <paste your API key here>\nTask: <describe what you want to build>\nRead my position first; if it is stale or unavailable, ask me to enter the online world and retry.`;
}
