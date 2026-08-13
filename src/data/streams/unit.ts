/* ------------------------------- 单元测试事件流 -------------------------------
   这套事件流要讲的设计主张是：覆盖率是**结果**而不是**证据**。一条不断言任何行为
   的用例同样能把行覆盖率推过阈值，因此「测试是否有效」必须由确定性程序去查，而
   不能交给写用例的人自证。

   叙事被固定为四条约束：
   1. 先失败后修复 —— 每条边界用例都要先在未修复的实现上稳定失败，用失败输出证明
      它确实覆盖到了那条分支；先写通过的用例，等于先写了一条不知道在测什么的用例。
   2. 门禁读断言而不读数字 —— 测试有效性门禁扫的是断言语句本身：仅 assertDoesNotThrow
      的用例、断言数为 0 的用例、以及「靠无断言用例撑起来的覆盖率增量」都会被判 fail。
      第一轮 GBK 与越权两组用例正是这样被拦下的。
   3. 返工是路由而不是重试 —— 沿「评审 → 单元测试开发」这条回退边定向回到责任节点，
      redo 只含被判无效的三条断言，keep 明确保留已确认有效的缺列用例与解析器缺陷结论，
      证据不重复采集。
   4. 覆盖率报告的回写是一次受控写入 —— 有 traceId、有参数校验、有审计，之后由人在
      收敛后的事实上判定是否交付，而不是由「覆盖率达标」自动推进。

   业务背景：QFII 投票项目（Java / Maven，仓库 vote_org_qfii，包名
   com.sse.vote.qfii.upload）中，股东名册上传的 RosterParser 只有正常路径用例，
   GBK 编码、证件号字段缺列、非持有人越权上传三类边界分支全部裸奔。
   ---------------------------------------------------------------------------- */

import type { AgentEvent } from "../mock";

export const unitStream: AgentEvent[] = [
  {
    id: "ut1",
    kind: "reasoning",
    title: "已思考 7 秒",
    body: "任务写的是「补齐边界用例并让覆盖率过阈值」，但这两件事之间没有必然关系——只要多写几个把方法调一遍的用例，行覆盖率一样会涨。所以要先把三条分支的**预期行为**定下来：GBK 名册应当被正确识别而不是解析出乱码持有人名称、证件号列缺失应当抛出带列名的业务异常而不是静默跳过整行、非持有人上传应当被权限校验拒绝并留审计。定下预期之后再写用例，并且必须先在当前实现上跑一遍确认它失败——失败输出才是这条用例真的覆盖到那条分支的证据。",
    ms: 7_400,
  },
  {
    id: "ut2",
    kind: "plan",
    steps: [
      { label: "读 RosterParser 与既有用例，圈出无断言覆盖的分支", status: "done" },
      { label: "为三类边界分支各写一条预期失败用例", status: "done" },
      { label: "确认三条用例在当前实现上稳定失败", status: "active" },
      { label: "修复解析与权限校验，跑 jacoco 覆盖率", status: "todo" },
      { label: "过测试有效性与覆盖率门禁后提交交付", status: "todo" },
    ],
  },
  {
    id: "ut3",
    kind: "tool",
    tool: "read",
    label: "read_file",
    meta: "com/sse/vote/qfii/upload — 4 files, 612 lines",
    status: "ok",
    lines: [
      "src/main/java/com/sse/vote/qfii/upload/RosterParser.java:41    new InputStreamReader(in, StandardCharsets.UTF_8); // 编码硬编码",
      "src/main/java/com/sse/vote/qfii/upload/RosterParser.java:88    if (idx < 0) { continue; }  // 列缺失静默跳行，未抛异常",
      "src/main/java/com/sse/vote/qfii/upload/RosterUploadService.java:57  // TODO 校验上传方是否为该会议的名义持有人",
      "src/test/java/com/sse/vote/qfii/upload/RosterParserTest.java:1    共 6 例，全部为 UTF-8 正常名册路径",
    ],
  },
  {
    id: "ut4",
    kind: "handoff",
    from: "requirement",
    to: "testing",
    title: "需求智能体 → 测试智能体：三类边界分支的预期行为与验收条件",
    scope: [
      "只补 upload 包的用例与被用例暴露的最小实现修复，不动 collect 包与对外报送字段",
      "编码识别范围限定 UTF-8 / UTF-8 BOM / GBK 三种，不引入第三方编码探测库",
      "越权判定复用既有名义持有人关系表，不新建权限模型",
    ],
    done: [
      "GBK 名册解析出的持有人名称与期望字符串逐字相等，而非仅校验非空",
      "证件号列缺失时抛出 RosterColumnMissingException，异常消息含缺失列名「证件号」",
      "非该会议名义持有人上传时被拒绝，返回码 4030 且落一条审计记录",
      "RosterParser 与 RosterUploadService 行覆盖率不低于 85%，分支覆盖率不低于 80%",
    ],
    open: ["历史已入库的 GBK 乱码名册是否需要重新解析回补，需人工判定"],
    evidence: ["ev-req-11", "ev-scan-12"],
  },
  {
    id: "ut5",
    kind: "diff",
    summary: "新增三类边界分支的预期失败用例，暂不改实现",
    files: [
      { path: "src/test/java/com/sse/vote/qfii/upload/RosterParserEncodingTest.java", added: 74, removed: 0 },
      { path: "src/test/java/com/sse/vote/qfii/upload/RosterParserColumnTest.java", added: 58, removed: 0 },
      { path: "src/test/java/com/sse/vote/qfii/upload/RosterUploadAuthTest.java", added: 66, removed: 0 },
      { path: "src/test/resources/roster/roster-gbk.csv", added: 12, removed: 0 },
    ],
  },
  {
    id: "ut6",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn -Dtest='RosterParser*Test,RosterUploadAuthTest' test",
    status: "fail",
    lines: [
      "$ mvn -Dtest='RosterParser*Test,RosterUploadAuthTest' test",
      "",
      " [INFO] Scanning for projects...  vote_org_qfii (JDK 17 · JUnit 5.10.2)",
      "",
      " RosterParserEncodingTest.GBK 名册应解析出正确的持有人名称",
      " [ERROR] org.opentest4j.AssertionFailedError:",
      " [ERROR]   expected: <中国工商银行股份有限公司> but was: <�й���������ɷ����޹�˾>",
      "",
      " RosterParserColumnTest.缺少证件号列应抛出 RosterColumnMissingException",
      " [ERROR] Expected RosterColumnMissingException to be thrown, but nothing was thrown",
      "",
      " RosterUploadAuthTest.非名义持有人上传应被拒绝",
      " [ERROR]   expected code: <4030> but was: <2000>",
      "",
      " Tests run: 14, Failures: 3, Errors: 0, Skipped: 0",
      " [ERROR] BUILD FAILURE  ·  Total time: 2.07s",
    ],
  },
  {
    id: "ut7",
    kind: "text",
    body: "三条用例都按预期失败了，而且失败方式各自指向一条确定的分支：GBK 名册被按 UTF-8 读成乱码，说明 `RosterParser` 第 41 行的编码是硬编码而非按 BOM 与字节特征识别；缺列场景「什么都没抛」，说明第 88 行的 `continue` 把数据缺陷咽掉了，上传方看到的是「成功但少了几行」；越权上传返回 2000，说明 `RosterUploadService` 第 57 行的 TODO 从未实现，任何持有通行证的机构都能给别人的会议上传名册。接下来按这三条失败逐一修复，用例内容不再改动——用例是这次的验收标准，改用例就等于改标准。",
  },
  {
    id: "ut8",
    kind: "approval",
    command: "mvn -Dtest='Roster*Test' test -Djacoco.skip=false -Djacoco.haltOnFailure=false",
    rationale: "需要在沙箱内运行 upload 包用例并生成 target/site/jacoco 覆盖率报告，供覆盖率门禁读取。命令只写 target 目录，不触碰源码与外部系统。",
    risk: "low",
  },
  {
    id: "ut9",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn -Dtest='Roster*Test' test -Djacoco.skip=false",
    status: "warn",
    lines: [
      "$ mvn -Dtest='Roster*Test' test -Djacoco.skip=false",
      "",
      " RosterParserTest            (6 tests)  0.19s",
      " RosterParserEncodingTest    (5 tests)  0.31s",
      " RosterParserColumnTest      (4 tests)  0.16s",
      " RosterUploadAuthTest        (5 tests)  0.44s",
      "",
      " [INFO] jacoco 覆盖率报告  target/site/jacoco/index.html",
      " RosterParser.java           行 88.6 | 分支 81.2 | 方法 100",
      " RosterUploadService.java    行 86.9 | 分支 78.4 | 方法 92.3",
      "",
      " [WARNING] 3 个用例未包含任何 assert* / verify 调用",
      " Tests run: 20, Failures: 0, Errors: 0, Skipped: 0",
      " [INFO] BUILD SUCCESS  ·  Total time: 3.02s",
    ],
  },
  {
    id: "ut10",
    kind: "tests",
    passed: 20,
    failed: 0,
    skipped: 0,
    ms: 3020,
  },
  {
    id: "ut11",
    kind: "gate",
    gate: "测试有效性与覆盖率门禁",
    node: "评审",
    verdict: "block",
    reviewer: "评审智能体 · review-2（独立审查）",
    checks: [
      { dim: "预期失败留痕", state: "pass", note: "三条边界用例均有修复前的稳定失败输出，分支归属可核对" },
      {
        dim: "测试有效性",
        state: "fail",
        note: "3 例无有效断言：GBK 大文件用例仅 assertDoesNotThrow，越权审计用例只调不断言，缺列用例断言了异常类型但未断言消息含「证件号」",
      },
      {
        dim: "覆盖率构成",
        state: "fail",
        note: "RosterParser 行覆盖 88.6% 中有 5.2 个百分点由上述无断言用例贡献；剔除后为 83.4%，低于 85% 阈值",
      },
      { dim: "分支覆盖阈值", state: "warn", note: "RosterUploadService 分支覆盖 78.4%，低于 80% 阈值 1.6 个百分点，越权拒绝后的审计失败分支未覆盖" },
      { dim: "断言精度", state: "fail", note: "编码用例用 contains 而非 isEqualTo 比对名称，乱码前缀相同时无法判失败" },
      { dim: "改动范围", state: "pass", note: "仅 src/test/java 与 upload 包 3 个实现文件，未溢出交接物 scope" },
    ],
    evidence: ["ev-test-13", "ev-cover-14"],
  },
  {
    id: "ut12",
    kind: "rework",
    reason: "测试有效性与覆盖率构成两个维度未通过：3 例用例无有效断言，剔除其贡献后行覆盖率不足阈值",
    fromNode: "评审",
    toNode: "单元测试开发",
    role: "testing",
    round: 2,
    redo: [
      "GBK 大文件用例把 assertDoesNotThrow 换成逐行比对持有人名称与证件号的 assertEquals",
      "越权审计用例补 assertThat(auditRecords).hasSize(1) 与操作人、会议编号、拒绝原因三项字段断言",
      "缺列用例补 assertThat(ex.getMessage()).contains(\"证件号\")，编码用例 contains 改为 isEqualTo",
      "补一条越权拒绝后审计写入失败的用例，覆盖 RosterUploadService 剩余分支",
    ],
    keep: [
      "三条边界用例的修复前失败输出与分支归属结论",
      "RosterParserColumnTest 已判定有效的缺列断言与 RosterColumnMissingException 定义",
      "编码硬编码、静默跳行、权限 TODO 三处缺陷的定位结论与调用链证据",
      "src/test/resources/roster/roster-gbk.csv 等测试样本，无需重新构造",
    ],
  },
  {
    id: "ut13",
    kind: "handoff",
    from: "review",
    to: "testing",
    title: "评审智能体 → 测试智能体：定向返工交接（第 2 轮）",
    scope: ["仅补 3 例的断言与 1 条审计失败用例，不重做已判定有效的用例与实现修复"],
    done: [
      "upload 包全部用例断言数大于 0，且断言对象为业务字段而非「未抛异常」",
      "剔除无断言用例后 RosterParser 行覆盖率仍不低于 85%，RosterUploadService 分支覆盖率不低于 80%",
    ],
    evidence: ["ev-gate-15"],
  },
  {
    id: "ut14",
    kind: "tool",
    tool: "edit",
    label: "apply_patch",
    meta: "3 files changed · +41 −9",
    status: "ok",
  },
  {
    id: "ut15",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn clean test -Djacoco.skip=false",
    status: "ok",
    lines: [
      "$ mvn clean test -Djacoco.skip=false",
      "",
      " RosterParserTest            (6 tests)  0.18s",
      " RosterParserEncodingTest    (6 tests)  0.36s   UTF-8 / BOM / GBK",
      " RosterParserColumnTest      (4 tests)  0.15s",
      " RosterUploadAuthTest        (7 tests)  0.52s",
      "",
      " [INFO] jacoco 覆盖率报告  target/site/jacoco/index.html",
      " RosterParser.java           行 93.2 | 分支 89.6 | 方法 100",
      " RosterUploadService.java    行 91.7 | 分支 85.3 | 方法 100",
      "",
      " [INFO] 断言检查：23/23 用例包含有效断言",
      " Tests run: 23, Failures: 0, Errors: 0, Skipped: 0",
      " [INFO] BUILD SUCCESS  ·  Total time: 3.41s",
    ],
  },
  {
    id: "ut16",
    kind: "tests",
    passed: 23,
    failed: 0,
    skipped: 0,
    ms: 3410,
  },
  {
    id: "ut17",
    kind: "gate",
    gate: "测试有效性与覆盖率门禁",
    node: "评审",
    verdict: "pass",
    reviewer: "评审智能体 · review-2（第 2 轮 · 独立审查）",
    checks: [
      { dim: "预期失败留痕", state: "pass", note: "新增审计失败用例同样先在修复前跑出失败，四条分支均可追溯" },
      { dim: "测试有效性", state: "pass", note: "23/23 用例含有效断言，无 assertDoesNotThrow 兜底写法" },
      { dim: "覆盖率构成", state: "pass", note: "RosterParser 行覆盖 93.2%，全部由带断言用例贡献，剔除项为 0" },
      { dim: "分支覆盖阈值", state: "pass", note: "RosterUploadService 分支覆盖 85.3%，越权拒绝与审计失败两条分支均已覆盖" },
      { dim: "断言精度", state: "pass", note: "编码用例改为逐行 assertEquals 比对名称与证件号，乱码不可能误判为通过" },
      { dim: "改动范围", state: "pass", note: "返工仅动 3 个测试文件 +41 −9，未触碰实现代码" },
    ],
    evidence: ["ev-test-16", "ev-cover-17", "ev-review-18"],
  },
  {
    id: "ut18",
    kind: "controlled",
    conn: "质量管理平台 · vote_org_qfii",
    tier: "write",
    action: "回写 upload 包覆盖率与断言检查报告，更新测试任务状态",
    traceId: "trc-9f42c6e1",
    steps: [
      { label: "工具选择", state: "ok" },
      { label: "身份与分级授权", state: "ok" },
      { label: "上下文与参数校验", state: "ok" },
      { label: "连接器执行", state: "ok" },
      { label: "结果完整性检查", state: "ok" },
      { label: "调用审计", state: "ok" },
      { label: "任务状态回写", state: "ok" },
    ],
  },
  {
    id: "ut19",
    kind: "checkpoint",
    node: "交付",
    question: "股东名册上传的边界用例是否可以作为本次测试补充交付？",
    facts: [
      { label: "门禁结论", value: "6/6 维度通过（第 2 轮）", tone: "ok" },
      { label: "定向返工", value: "1 次 · 评审 → 单元测试开发，仅重做 3 例断言并补 1 条用例", tone: "info" },
      { label: "预期失败验证", value: "GBK 乱码、缺列静默跳行、越权返回 2000 三处缺陷均有修复前失败输出", tone: "ok" },
      { label: "测试有效性", value: "23/23 用例含有效断言，无断言用例贡献的覆盖率已剔除", tone: "ok" },
      { label: "覆盖率", value: "RosterParser 行 93.2 / 分支 89.6；RosterUploadService 行 91.7 / 分支 85.3", tone: "ok" },
      { label: "受控写入", value: "1 次覆盖率报告回写，已留痕 trc-9f42c6e1", tone: "info" },
      { label: "未决问题", value: "历史已入库的 GBK 乱码名册未回补，需单独评估数据修复范围", tone: "warn" },
    ],
    options: ["同意交付", "先出历史乱码名册回补方案", "退回单元测试开发补充用例"],
    decided: "同意交付",
    decidedBy: "me@agentflow.dev",
  },
];
