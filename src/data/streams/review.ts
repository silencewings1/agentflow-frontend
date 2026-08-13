/* ------------------------------- 代码审核事件流 -------------------------------
   这套事件流要讲的设计主张是：审核的价值不在「给出评语」，而在于**把结论收敛成
   可裁决的两类**——阻断项与建议项，并让每个阻断项都带着回退目标。

   因此叙事被固定为四条约束：
   1. 审查阶段严格只读 —— 差异获取与两路审查只允许 read / search 类工具调用，
      审查智能体不得顺手改代码。审查者与整改者分离，是「独立审查」成立的前提；
      一旦审查者自己动手，它就无法再充当自己的验证方。
   2. 结论必须分级 —— 阻断项（越权可达、敏感字段明文外泄）与建议项（命名、
      日志级别）走不同处置路径：前者必须整改并写明回退目标，后者由人决定是否处理。
      不分级的审查报告等于把判断责任推回给人。
   3. 门禁由确定性程序裁决 —— 复核放行门禁读的是越权路由清单、掩码覆盖率与审计
      落库条数，不读整改说明。第一轮整改漏掉了 denied 分支的审计留痕与异常响应体
      中的证件号，门禁只能出 block。
   4. 返工是路由而不是重试 —— 沿「复核放行 → 定向整改」这条回退边定向回到责任
      节点，redo 只含被推翻的两项，keep 明确保留已闭环的越权路由封堵与调用链证据，
      证据不重复采集。

   业务背景：QFII 投票项目（Java / Maven，仓库 vote_org_qfii，包名
   com.sse.vote.qfii.auth）审核 EkeyAuthenticator 的通行证校验与审计留痕——查
   越权可达路径（证书校验 fail-open 分支、拦截器路径漏配、缺少机构与会议的授权
   范围校验），以及名册证件号在业务日志与异常栈中的脱敏缺口。
   ---------------------------------------------------------------------------- */

import type { AgentEvent } from "../mock";

export const reviewStream: AgentEvent[] = [
  {
    id: "rv1",
    kind: "reasoning",
    title: "已思考 11 秒",
    body: "审核通行证校验，不能从 EkeyAuthenticator 这个类本身开始读。真正的越权风险有两种形态：一种是校验逻辑自己放过了（证书异常被吞掉后返回通过），另一种是校验根本没被调用到（拦截器路径没覆盖某些接口）。第二种只看类内部永远看不出来，必须反向找出「谁在调用它、哪些路由绕过了它」。脱敏缺口同理——不是看 MaskUtil 写得对不对，而是看名册证件号从 Controller 到日志、到异常响应体这一整条外泄面上，有几个出口没有掩码。整个审查阶段只读不改，改动交给整改节点，否则我既是审查者又是被审查者。",
    ms: 11_400,
  },
  {
    id: "rv2",
    kind: "plan",
    steps: [
      { label: "经受控连接层取差异、auth 包相关文件与项目规则", status: "done" },
      { label: "反向枚举 EkeyAuthenticator 调用链与拦截器覆盖路由", status: "done" },
      { label: "追踪名册证件号在日志与异常栈上的外泄出口", status: "done" },
      { label: "汇总问题并区分阻断项与建议项，给出回退目标", status: "active" },
      { label: "定向整改后复核越权路由、掩码覆盖与审计留痕", status: "todo" },
    ],
  },
  {
    id: "rv3",
    kind: "controlled",
    conn: "代码仓库平台 · vote_org_qfii",
    tier: "readonly",
    action: "拉取合并请求 !482 差异、auth 包全量文件与 AGENTS.md 规则（只读）",
    traceId: "trc-9c41e07f",
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
    id: "rv4",
    kind: "tool",
    tool: "search",
    label: "grep",
    meta: "EkeyAuthenticator|addPathPatterns|FilterRegistrationBean — 6 files, 17 matches",
    status: "warn",
    lines: [
      "src/main/java/com/sse/vote/qfii/auth/EkeyAuthenticator.java:74        public AuthResult verify(EkeyCert cert, String meetingId) {",
      "src/main/java/com/sse/vote/qfii/auth/EkeyAuthFilter.java:52            authenticator.verify(cert, req.getParameter(\"meetingId\"));",
      "src/main/java/com/sse/vote/qfii/config/WebMvcConfig.java:41            .addPathPatterns(\"/qfii/vote/**\", \"/qfii/collect/**\")",
      "src/main/java/com/sse/vote/qfii/config/WebMvcConfig.java:43            .excludePathPatterns(\"/qfii/**/health\", \"/api/v2/**\")",
      "src/main/java/com/sse/vote/qfii/roster/RosterQueryController.java:38   @GetMapping(\"/api/v2/qfii/roster/export\")  ← 命中 exclude，未经通行证校验",
      "src/main/java/com/sse/vote/qfii/collect/ResultDownloadController.java:29 @GetMapping(\"/api/v2/qfii/collect/result/download\")  ← 同上",
      "[WARN] EkeyAuthFilter 未注册为 FilterRegistrationBean，仅作为拦截器生效，exclude 即完全绕过",
    ],
  },
  {
    id: "rv5",
    kind: "tool",
    tool: "read",
    label: "read_file",
    meta: "src/main/java/com/sse/vote/qfii/auth/EkeyAuthenticator.java · L74-138",
    status: "warn",
    lines: [
      " 88   } catch (CertificateExpiredException | CertPathValidatorException e) {",
      " 89       log.warn(\"证书链校验异常，按兼容策略放行: {}\", e.getMessage());",
      " 90       return AuthResult.pass(cert.getSubjectCn());   ← fail-open",
      " ..",
      "112   String cn = cert.getSubjectCn();",
      "113   RosterEntry entry = rosterMapper.selectByIdCardNo(cn);",
      "114   if (entry == null) return AuthResult.deny(\"名册中无此证件号\");",
      "115   return AuthResult.pass(cn);   ← 只比对名册存在性",
      " ..",
      "131   // TODO 校验该通行证所属机构是否被授权访问本次会议 meetingId",
      "132   // 参数 meetingId 自 74 行传入后从未被使用",
      " ..",
      "136   auditLogger.success(cn, meetingId);   ← 仅成功分支落审计",
    ],
  },
  {
    id: "rv6",
    kind: "text",
    body: "功能与边界审查结论：越权可达路径有三条，且是叠加的。第一条是**路由绕过**——`EkeyAuthFilter` 名字叫 Filter，实际只在 `WebMvcConfig` 第 41 行以拦截器注册，且第 43 行 `excludePathPatterns(\"/api/v2/**\")` 把 `/api/v2/qfii/roster/export` 与 `/api/v2/qfii/collect/result/download` 整段排除，这两个接口返回的正是名册与征集结果，等于无凭证可读。第二条是**校验自身 fail-open**——第 88 行捕获 `CertificateExpiredException` 与 `CertPathValidatorException` 后走 `AuthResult.pass`，注释写「兼容策略」，实际效果是过期或被吊销的通行证一律通过。第三条是**缺授权范围校验**——`meetingId` 从第 74 行入参传进来，到第 131 行仍是 TODO，全程未使用；第 113 行只按证书 CN 查名册是否存在，因此 A 机构的合法通行证可以读取 B 机构在同一次会议的名册，属横向越权。三条都不在本次 MR 的改动行内，但都落在 MR 声明的影响范围里。",
  },
  {
    id: "rv7",
    kind: "tool",
    tool: "search",
    label: "grep",
    meta: "idCardNo|maskIdCard|getStackTrace|%replace — 9 files, 24 matches",
    status: "warn",
    lines: [
      "src/main/java/com/sse/vote/qfii/common/MaskUtil.java:18               public static String maskIdCard(String no)  // 保留前 6 后 4",
      "[OK]   auth/EkeyAuthFilter.java:61        log.info(\"通行证校验 subject={}\", MaskUtil.maskIdCard(cn));",
      "[WARN] roster/RosterQueryController.java:57 log.info(\"名册核验 idCardNo={} holderName={}\", req.getIdCardNo(), req.getHolderName());",
      "[WARN] roster/RosterImportService.java:143  log.error(\"名册导入失败 row={} idCardNo={}\", i, entry.getIdCardNo(), e);",
      "[WARN] collect/CollectResultExporter.java:96 log.debug(\"导出明细 {}\", JSON.toJSONString(entries));  // 整对象序列化，含证件号",
      "[FAIL] web/GlobalExceptionHandler.java:73   body.put(\"detail\", ex.getMessage());  // 校验异常 message 内含原始证件号",
      "[FAIL] web/GlobalExceptionHandler.java:78   body.put(\"trace\", ex.getStackTrace());  // 500 响应体直接回栈",
      "src/main/resources/logback-spring.xml                                无 %replace 掩码 pattern，无兜底",
    ],
  },
  {
    id: "rv8",
    kind: "tool",
    tool: "read",
    label: "read_file",
    meta: "src/main/java/com/sse/vote/qfii/web/GlobalExceptionHandler.java · L64-86",
    status: "fail",
    lines: [
      " 66   @ExceptionHandler(Exception.class)",
      " 67   public ResponseEntity<Map<String, Object>> onError(Exception ex) {",
      " 71       body.put(\"code\", 500);",
      " 73       body.put(\"detail\", ex.getMessage());",
      " 78       body.put(\"trace\", ex.getStackTrace());",
      " 80       log.error(\"未捕获异常\", ex);",
      " 82       return ResponseEntity.status(500).body(body);",
      " ..",
      "[FAIL] RosterEntryValidator 抛出的 message 形如「证件号 310101199001011234 不在名册中」",
      "[FAIL] 该响应体对未认证调用方同样可见（结合 rv4 的路由绕过，构成完整外泄链）",
    ],
  },
  {
    id: "rv9",
    kind: "text",
    body: "安全与合规审查结论，按处置方式分成两类。**阻断项 3 项**：其一，`/api/v2/qfii/roster/export` 与 `/api/v2/qfii/collect/result/download` 无凭证可达，必须把 `EkeyAuthFilter` 改为 `FilterRegistrationBean` 注册并按接口白名单收口，回退目标是定向整改；其二，第 88 行 fail-open 分支必须改为 `AuthResult.deny`，证书异常不得放行，回退目标同上；其三，`GlobalExceptionHandler` 第 73、78 行把 `ex.getMessage()` 与堆栈直接写进响应体，与路由绕过叠加后构成「未认证即可读到明文证件号」的完整外泄链，必须只回错误码并在 `logback-spring.xml` 补 `%replace(%msg){'(\\d{6})\\d{8}(\\w{3}[\\dxX])','$1********$2'}` 兜底掩码。**建议项 2 项**：`CollectResultExporter` 第 96 行整对象 `JSON.toJSONString` 打 debug 日志，建议改为只打条数与会议编号；`RosterImportService` 第 143 行的错误日志建议统一走 `MaskUtil.maskIdCard`。另有一处独立记账——`EkeyAuthenticator` 第 136 行只在成功分支调 `auditLogger.success`，deny 与异常分支没有任何审计留痕，被拒绝的越权尝试查不到，这项计入阻断项的审计留痕维度。",
  },
  {
    id: "rv10",
    kind: "handoff",
    from: "review",
    to: "orchestrator",
    title: "审查智能体 → 主控智能体：审查结论汇总（阻断 3 项 / 建议 2 项）",
    scope: [
      "阻断项 1：EkeyAuthFilter 改 FilterRegistrationBean 注册，撤销 /api/v2/** 整段 exclude —— 回退目标 定向整改",
      "阻断项 2：EkeyAuthenticator L88 fail-open 改 deny，并落地 L131 的机构与会议授权范围校验 —— 回退目标 定向整改",
      "阻断项 3：GlobalExceptionHandler 不回 message 与堆栈，logback 补 %replace 掩码，deny 分支补审计 —— 回退目标 定向整改",
      "建议项：导出明细 debug 日志与名册导入错误日志的掩码统一，由责任人决定是否本次处理",
    ],
    done: [
      "无凭证可达路由清零，越权路由清单由复核节点重新枚举核对",
      "证书异常一律 deny，横向越权用例（A 机构读 B 机构名册）返回 403",
      "名册证件号在业务日志、异常响应体、导出日志三处出口均经掩码，无明文",
      "auth 包 deny 与异常分支审计落库条数与请求数一致，且带 traceId",
    ],
    open: [
      "撤销 /api/v2/** exclude 会影响已对接的 3 个外部系统，是否需要过渡期双轨放行待人工判定",
      "建议项 2 项默认不阻断合并，需责任人明确是否本次一并处理",
    ],
    evidence: ["ev-diffscan-01", "ev-trace-02", "ev-sast-03"],
  },
  {
    id: "rv11",
    kind: "diff",
    summary: "第 1 轮定向整改：Filter 注册收口、fail-open 改 deny、补授权范围校验",
    files: [
      { path: "src/main/java/com/sse/vote/qfii/auth/EkeyAuthenticator.java", added: 42, removed: 9 },
      { path: "src/main/java/com/sse/vote/qfii/auth/EkeyAuthFilter.java", added: 18, removed: 3 },
      { path: "src/main/java/com/sse/vote/qfii/config/WebMvcConfig.java", added: 14, removed: 6 },
      { path: "src/main/java/com/sse/vote/qfii/roster/RosterQueryController.java", added: 5, removed: 3 },
      { path: "src/test/java/com/sse/vote/qfii/auth/EkeyAuthFilterSecurityTest.java", added: 96, removed: 0 },
    ],
  },
  {
    id: "rv12",
    kind: "approval",
    command: "mvn -Dtest='EkeyAuth*Test,RosterQuery*Test' test -Dspotbugs.skip=false -Dsast.rules=sensitive-log",
    rationale: "需要在沙箱内运行 auth 包安全用例与敏感字段外泄规则扫描，核对越权路由是否清零、日志与响应体是否还有明文证件号。命令只读源码并写入 target/ 报告，不触及任何真实名册数据。",
    risk: "low",
  },
  {
    id: "rv13",
    kind: "tests",
    passed: 34,
    failed: 3,
    skipped: 0,
    ms: 5240,
  },
  {
    id: "rv14",
    kind: "gate",
    gate: "复核放行门禁",
    node: "复核放行",
    verdict: "block",
    reviewer: "审查智能体 · review-sec-2（独立审查）",
    checks: [
      { dim: "越权可达性", state: "pass", note: "路由枚举 57 条，无凭证可达 0 条；fail-open 分支已改 deny，过期证书返回 403" },
      { dim: "授权范围校验", state: "pass", note: "meetingId 已参与裁决，A 机构读 B 机构名册用例返回 403 且带拒绝原因" },
      { dim: "敏感字段脱敏", state: "fail", note: "RosterQueryController:57 已改掩码，但 GlobalExceptionHandler:73 仍回 ex.getMessage()，扫描命中 2 条明文证件号" },
      { dim: "异常栈泄露", state: "fail", note: "500 响应体仍含 trace 字段；logback-spring.xml 未补 %replace 兜底掩码" },
      { dim: "审计留痕完整性", state: "fail", note: "deny 分支仍未落库：请求 41 次、审计 26 条，缺 15 条且异常分支无 traceId" },
      { dim: "改动范围", state: "pass", note: "5 文件均在交接物 scope 内，未改对外报送字段与 vote-org-api.yaml" },
      { dim: "建议项处置", state: "warn", note: "2 项建议项未处理，不阻断，需责任人在检查点确认" },
    ],
    evidence: ["ev-route-04", "ev-sast-05", "ev-audit-06"],
  },
  {
    id: "rv15",
    kind: "rework",
    reason: "敏感字段脱敏、异常栈泄露、审计留痕完整性三个维度未通过：整改只覆盖了入口校验侧，外泄面与留痕侧未动",
    fromNode: "复核放行",
    toNode: "定向整改",
    role: "development",
    round: 2,
    redo: [
      "GlobalExceptionHandler 只返回错误码与请求 id，移除 detail 与 trace 字段，堆栈仅入服务端日志",
      "logback-spring.xml 补 %replace 证件号掩码 pattern，作为所有 appender 的兜底",
      "EkeyAuthenticator 的 deny 与异常分支补 auditLogger.deny，并透传 traceId",
      "安全用例补「未认证请求 500 响应体不含证件号」与「deny 审计条数等于拒绝次数」两条断言",
    ],
    keep: [
      "EkeyAuthFilter 改 FilterRegistrationBean 注册后的 57 条越权路由枚举结果",
      "fail-open 改 deny 与 meetingId 授权范围校验的实现及其调用链证据",
      "改动范围比对结论：对外报送字段与 vote-org-api.yaml 零变更",
      "两项建议项的原始定位与处置意见，不重复采集",
    ],
  },
  {
    id: "rv16",
    kind: "handoff",
    from: "review",
    to: "development",
    title: "审查智能体 → 开发智能体：定向返工交接（第 2 轮）",
    scope: [
      "仅动异常处理器、日志配置与审计留痕三处，不重做已复核通过的 Filter 注册与授权范围校验",
    ],
    done: [
      "敏感字段扫描 0 命中，500 响应体不含 detail 与 trace",
      "deny 与异常分支审计条数与拒绝次数一致，每条带 traceId",
    ],
    open: ["移除 detail 字段后前端错误提示文案需同步调整，已记入下游任务"],
    evidence: ["ev-gate-07"],
  },
  {
    id: "rv17",
    kind: "tool",
    tool: "shell",
    label: "shell",
    meta: "mvn clean test -Dspotbugs.skip=false -Dsast.rules=sensitive-log",
    status: "ok",
    lines: [
      "$ mvn clean test -Dspotbugs.skip=false -Dsast.rules=sensitive-log",
      "",
      " EkeyAuthFilterSecurityTest      (16 tests) 1.84s   含 403 越权用例 9 例",
      " EkeyAuthenticatorTest           (14 tests) 0.51s   证书过期 / 吊销 / 跨机构 全部 deny",
      " GlobalExceptionHandlerTest       (7 tests) 0.19s   500 响应体断言无 detail、无 trace",
      " AuthAuditLoggerTest              (6 tests) 0.22s   deny 分支落库 41/41，均含 traceId",
      "",
      " [INFO] sast · sensitive-log 规则：扫描 214 文件，命中 0 条（上一轮 2 条）",
      " [INFO] spotbugs：0 high、0 medium",
      "",
      " Tests run: 43, Failures: 0, Errors: 0, Skipped: 0",
      " [INFO] BUILD SUCCESS  ·  Total time: 6.12s",
    ],
  },
  {
    id: "rv18",
    kind: "gate",
    gate: "复核放行门禁",
    node: "复核放行",
    verdict: "pass",
    reviewer: "审查智能体 · review-sec-2（独立审查 · 第 2 轮）",
    checks: [
      { dim: "越权可达性", state: "pass", note: "路由枚举复跑 57 条一致，无凭证可达 0 条，结论沿用第 1 轮已闭环证据" },
      { dim: "授权范围校验", state: "pass", note: "跨机构与过期证书共 9 例越权用例全部 403，拒绝原因可读" },
      { dim: "敏感字段脱敏", state: "pass", note: "sensitive-log 规则扫描 214 文件 0 命中；logback %replace 兜底掩码生效" },
      { dim: "异常栈泄露", state: "pass", note: "500 响应体仅回 code 与 requestId，堆栈只入服务端日志且经掩码" },
      { dim: "审计留痕完整性", state: "pass", note: "deny 分支审计 41/41 落库，条数与拒绝次数一致，均含 traceId" },
      { dim: "改动范围", state: "pass", note: "返工仅动 3 文件 +37 −12，未溢出返工清单" },
      { dim: "建议项处置", state: "warn", note: "2 项建议项仍未处理，按分级规则不阻断，转人工判定" },
    ],
    evidence: ["ev-route-08", "ev-sast-09", "ev-audit-10", "ev-review-11"],
  },
  {
    id: "rv19",
    kind: "checkpoint",
    node: "复核放行",
    question: "EkeyAuthenticator 通行证校验与审计留痕的审核结论是否可以放行进入人工合并？",
    facts: [
      { label: "门禁结论", value: "阻断项 5/5 维度通过，建议项 2 项未处理（第 2 轮）", tone: "ok" },
      { label: "越权可达", value: "整改前 2 条无凭证可达路由 + 1 处 fail-open + 1 处缺授权范围，现全部封堵", tone: "ok" },
      { label: "脱敏缺口", value: "整改前 6 处出口有明文证件号，现扫描 0 命中", tone: "ok" },
      { label: "审计留痕", value: "deny 分支由 26/41 补齐至 41/41，均含 traceId", tone: "ok" },
      { label: "定向返工", value: "1 次 · 复核放行 → 定向整改，仅重做外泄面与留痕侧", tone: "info" },
      { label: "测试", value: "43 通过 / 0 失败 / 0 跳过 · spotbugs 0 high", tone: "ok" },
      { label: "兼容影响", value: "撤销 /api/v2/** exclude 影响 3 个已对接外部系统，过渡期方案未定", tone: "warn" },
      { label: "建议项", value: "导出明细 debug 日志、名册导入错误日志的掩码统一，待责任人取舍", tone: "warn" },
    ],
    options: ["同意放行并合并", "先出外部系统过渡期方案", "连同 2 项建议项一并整改", "退回定向整改"],
    decided: "先出外部系统过渡期方案",
    decidedBy: "me@agentflow.dev",
  },
];
