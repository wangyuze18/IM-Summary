# Few-shot 示例集

这些示例用于解释决议/提议、状态覆盖、重要消息原文保真和任务专属审核。实际系统可按模型能力选择是否注入，不能把示例事实带入真实会话。

## 示例一：提议不是决议

输入：

```text
[m01] @甲：要不周五发 1.0.4？
[m02] @乙：测试还没过，先不要定。
```

事件与状态：

```json
{
  "events": [
    {"eventId":"E1","content":"@甲提议周五发布1.0.4","evidenceMessageIds":["m01"],"state":"proposed"},
    {"eventId":"E2","content":"测试未通过，发布日期暂不确定","evidenceMessageIds":["m02"],"state":"active"}
  ]
}
```

正确摘要：不产生“周五发布”的决议，可把测试未通过列为问题。正确重要消息可保留 m02 作为阻断；m01 只是未达成的提议，不应因包含日期而自动选入。

## 示例二：旧状态被覆盖

输入：

```text
[m10] @项目经理：版本改到周五发布。
[m11] @测试：回归发现支付阻断问题。
[m12] @项目经理：周五不发了，修好后下周一再发布。
```

状态输出：

```json
{
  "events": [
    {"eventId":"E10","state":"superseded","supersedes":null},
    {"eventId":"E11","state":"active","owner":null},
    {"eventId":"E12","state":"confirmed","supersedes":"E10"}
  ]
}
```

摘要必须使用“下周一发布”；重要消息应选择 m11 与 m12，不应再把 m10 当作当前发布日期。

## 示例三：待办负责人不可推断

输入：

```text
[m20] @产品：登录失败需要尽快看看。
[m21] @后端-小王：我今天下班前修登录接口。
```

正确待办：

```json
{"priority":"高","task":"修复登录接口","owner":"@后端-小王","dueDate":"今天下班前","status":"进行中"}
```

m20 没有负责人，m21 才形成明确指派。重要消息可选择 m21，content 必须保持原文，不能改成“@小王今日修复登录问题”。

## 示例四：重要消息精确抽取

输入：

```text
[m30] @甲：收到，谢谢。
[m31] @乙：生产证书明天过期，当前发布会被阻断。
[m32] @甲：我下午三点前完成证书续期并通知测试。
```

正确输出：

```json
{
  "importantMessages": [
    {
      "messageId":"m31","speaker":"@乙","content":"生产证书明天过期，当前发布会被阻断。",
      "type":"阻断","priority":"高","stakeholders":["发布-@乙"],"reason":"证书到期阻塞发布"
    },
    {
      "messageId":"m32","speaker":"@甲","content":"我下午三点前完成证书续期并通知测试。",
      "type":"待办","priority":"高","stakeholders":["执行-@甲","测试-未明确"],"reason":"含明确任务与截止时间"
    }
  ]
}
```

m30 是寒暄，应排除。stakeholder 角色映射没有可靠资料时应使用“未明确”，不得虚构具体姓名。

## 示例五：摘要审核路由

候选摘要：

```json
{"decisions":[{"title":"团队决定周五发布1.0.4","context":"","status":"已达成"}]}
```

证据只有“要不周五发？”。审核结果：

```json
{
  "passed":false,
  "issues":[{
    "type":"decision_validity","severity":"error","fieldPath":"decisions[0]",
    "eventId":"E1","description":"提议被误写为已达成决议","routeTo":"summary"
  }]
}
```

只修订摘要分支；重要消息分支无需重跑。

## 示例六：重要消息审核路由

候选条目把 m31 改写为“证书问题可能影响发布”。审核结果：

```json
{
  "passed":false,
  "issues":[{
    "type":"source","severity":"error","messageId":"m31",
    "description":"content 改写了原消息","suggestion":"恢复 m31 清洗标签后的原文"
  }]
}
```

只修订重要消息分支；摘要分支保持不变。
