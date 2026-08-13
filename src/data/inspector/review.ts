/* ==================== 代码审核（wf-review）的检查面板现场 ====================
   这套现场要与 data/streams/review.ts 的事件流互为印证：事件流讲的是
   「审查只读、结论分级、门禁裁决、返工是路由」，检查面板则要让这条叙事可核验 ——
   文件树给出「审查阶段零改动、改动集中在定向整改」的证据、diff 给出 fail-open
   改 fail-close 与外泄面收口的逻辑本身、证据链把阻断项与建议项分开记账、回放
   给出「哪一维度未通过、返工回到了哪个节点」、终端给出可复算的越权路由枚举。

   业务背景：QFII 投票项目（Java / Maven，仓库 vote_org_qfii，分支
   review/ekey-auth-audit，包名 com.sse.vote.qfii.auth）审核 EkeyAuthenticator
   的通行证校验与审计留痕。三处阻断项：WebMvcConfig 的
   excludePathPatterns("/api/v2/**") 让 /api/v2/qfii/roster/export 无凭证可达；
   EkeyAuthenticator 捕获 CertificateExpiredException 后返回 pass 构成 fail-open；
   GlobalExceptionHandler 回传 ex.getMessage() 与堆栈导致名册证件号明文外泄。
   ========================================================================= */

import type { DiffLine, FileNode } from "../mock";
import type { EvidenceItem, ReplayStep } from "../settings";
import type { InspectorBundle } from "./bundle";

/* 文件树：审核类任务的改动集中在「定向整改」一个阶段，因此带 status 的文件少而精 ——
   路径与事件流 rv11 的 diff 文件列表以及 rv15 返工清单逐一对应。
   刻意保留两个不带标记的文件：CollectResultExporter 与 RosterImportService 是
   rv9 里的两项建议项，按分级规则不阻断合并，未处理这件事本身要在界面上看得见。 */
const files: FileNode[] = [
  {
    name: "src/main/java/com/sse/vote/qfii",
    kind: "dir",
    children: [
      {
        name: "auth",
        kind: "dir",
        children: [
          { name: "EkeyAuthenticator.java", kind: "file", status: "modified", lines: 176 },
          { name: "EkeyAuthFilter.java", kind: "file", status: "modified", lines: 94 },
          { name: "AuthAuditLogger.java", kind: "file", lines: 72 },
        ],
      },
      {
        name: "config",
        kind: "dir",
        children: [{ name: "WebMvcConfig.java", kind: "file", status: "modified", lines: 58 }],
      },
      {
        name: "web",
        kind: "dir",
        children: [
          { name: "GlobalExceptionHandler.java", kind: "file", status: "modified", lines: 90 },
        ],
      },
      {
        name: "roster",
        kind: "dir",
        children: [
          { name: "RosterQueryController.java", kind: "file", status: "modified", lines: 88 },
          { name: "RosterImportService.java", kind: "file", lines: 156 },
        ],
      },
      {
        name: "collect",
        kind: "dir",
        children: [{ name: "CollectResultExporter.java", kind: "file", lines: 112 }],
      },
    ],
  },
  {
    name: "src/main/resources",
    kind: "dir",
    children: [
      { name: "logback-spring.xml", kind: "file", status: "modified", lines: 74 },
      { name: "vote-org-api.yaml", kind: "file" },
    ],
  },
  {
    name: "src/test/java/com/sse/vote/qfii/auth",
    kind: "dir",
    children: [
      { name: "EkeyAuthFilterSecurityTest.java", kind: "file", status: "added", lines: 96 },
      { name: "EkeyAuthenticatorTest.java", kind: "file", lines: 88 },
    ],
  },
  { name: "pom.xml", kind: "file" },
];

/* diffs：key 与上面文件树拼出的路径完全一致（父目录名 + / + 文件名）。
   三个 key 对应三处阻断项，也刚好是三种不同的「不可信形态」：
   路由层根本没走校验、校验层放过了异常、错误响应层把内部事实抖了出去。 */
const diffs: Record<string, DiffLine[]> = {
  /* 阻断项 1：路由绕过。exclude("/api/v2/**") 是最危险的一行 —— 它不改任何校验
     逻辑，却让 /api/v2/** 下的名册导出与结果下载整段跳过通行证校验。
     整改改为「白名单只放行健康检查」，并把 EkeyAuthFilter 提升为
     FilterRegistrationBean 注册，避免拦截器 exclude 即等于完全绕过。 */
  "src/main/java/com/sse/vote/qfii/config/WebMvcConfig.java": [
    { type: "hunk", text: "@@ -36,12 +36,26 @@ public class WebMvcConfig implements WebMvcConfigurer" },
    { type: "ctx", n: 36, text: "    @Override" },
    { type: "ctx", n: 37, text: "    public void addInterceptors(InterceptorRegistry registry) {" },
    { type: "ctx", n: 38, text: "        registry.addInterceptor(ekeyAuthInterceptor)" },
    { type: "del", n: 39, text: "                // 拦截器只覆盖显式列出的两段路径，新增接口需要手工补" },
    { type: "del", n: 40, text: "                .addPathPatterns(\"/qfii/vote/**\", \"/qfii/collect/**\")" },
    { type: "del", n: 41, text: "                // 兼容 v2 网关：整段排除，避免网关重复鉴权（历史遗留）" },
    { type: "del", n: 42, text: "                .excludePathPatterns(\"/qfii/**/health\", \"/api/v2/**\");" },
    { type: "add", n: 39, text: "                // 改为全量拦截 + 白名单：默认需凭证，例外必须显式且逐条列出。" },
    { type: "add", n: 40, text: "                // 原 exclude(\"/api/v2/**\") 使 /api/v2/qfii/roster/export 与" },
    { type: "add", n: 41, text: "                // /api/v2/qfii/collect/result/download 无凭证可达，属越权可达路径。" },
    { type: "add", n: 42, text: "                .addPathPatterns(\"/**\")" },
    { type: "add", n: 43, text: "                .excludePathPatterns(AuthWhitelist.PATHS);" },
    { type: "ctx", n: 44, text: "    }" },
    { type: "ctx", n: 45, text: "" },
    { type: "add", n: 46, text: "    /** 通行证校验必须在 Filter 链上生效：拦截器早于 Controller 但晚于" },
    { type: "add", n: 47, text: "     *  Filter，且一旦被 exclude 命中就完全不执行；注册为 Filter 后，" },
    { type: "add", n: 48, text: "     *  白名单之外的任何路由都无法在校验前触达业务代码。 */" },
    { type: "add", n: 49, text: "    @Bean" },
    { type: "add", n: 50, text: "    public FilterRegistrationBean<EkeyAuthFilter> ekeyAuthFilter(" },
    { type: "add", n: 51, text: "            EkeyAuthenticator authenticator) {" },
    { type: "add", n: 52, text: "        FilterRegistrationBean<EkeyAuthFilter> reg = new FilterRegistrationBean<>();" },
    { type: "add", n: 53, text: "        reg.setFilter(new EkeyAuthFilter(authenticator));" },
    { type: "add", n: 54, text: "        reg.addUrlPatterns(\"/qfii/*\", \"/api/v2/qfii/*\");" },
    { type: "add", n: 55, text: "        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 10);" },
    { type: "add", n: 56, text: "        return reg;" },
    { type: "add", n: 57, text: "    }" },
    { type: "ctx", n: 58, text: "}" },
  ],
  /* 阻断项 2：fail-open 改 fail-close。原实现把「证书链校验抛异常」当成兼容问题
     放行，等于过期与被吊销的通行证一律通过；同时 meetingId 从入参传进来却从未
     参与裁决，A 机构的合法通行证可读 B 机构名册（横向越权）。
     第 2 轮返工还补了 deny 与异常分支的审计留痕 —— 被拒绝的越权尝试查不到，
     等于没有留痕。 */
  "src/main/java/com/sse/vote/qfii/auth/EkeyAuthenticator.java": [
    { type: "hunk", text: "@@ -84,16 +84,44 @@ public class EkeyAuthenticator" },
    { type: "ctx", n: 84, text: "    public AuthResult verify(EkeyCert cert, String meetingId) {" },
    { type: "ctx", n: 85, text: "        try {" },
    { type: "ctx", n: 86, text: "            certPathValidator.validate(cert.getChain(), trustParams);" },
    { type: "ctx", n: 87, text: "        } catch (CertificateExpiredException | CertPathValidatorException e) {" },
    { type: "del", n: 88, text: "            // 兼容策略：部分机构证书更新滞后，先放行避免影响征集" },
    { type: "del", n: 89, text: "            log.warn(\"证书链校验异常，按兼容策略放行: {}\", e.getMessage());" },
    { type: "del", n: 90, text: "            return AuthResult.pass(cert.getSubjectCn());" },
    { type: "add", n: 88, text: "            // fail-open 改 fail-close：证书链校验异常是「无法证明其有效」，" },
    { type: "add", n: 89, text: "            // 不是「暂时查不到」，不得放行。兼容问题由证书更新流程解决。" },
    { type: "add", n: 90, text: "            auditLogger.deny(cert, meetingId, \"证书链校验失败\", MDC.get(\"traceId\"));" },
    { type: "add", n: 91, text: "            log.warn(\"证书链校验失败 subject={} trace={}\"," },
    { type: "add", n: 92, text: "                    MaskUtil.maskIdCard(cert.getSubjectCn()), MDC.get(\"traceId\"));" },
    { type: "add", n: 93, text: "            return AuthResult.deny(\"通行证已过期或已被吊销\");" },
    { type: "ctx", n: 94, text: "        }" },
    { type: "ctx", n: 95, text: "" },
    { type: "ctx", n: 96, text: "        String cn = cert.getSubjectCn();" },
    { type: "ctx", n: 97, text: "        RosterEntry entry = rosterMapper.selectByIdCardNo(cn);" },
    { type: "ctx", n: 98, text: "        if (entry == null) {" },
    { type: "del", n: 99, text: "            return AuthResult.deny(\"名册中无此证件号\");" },
    { type: "add", n: 99, text: "            auditLogger.deny(cert, meetingId, \"名册中无此主体\", MDC.get(\"traceId\"));" },
    { type: "add", n: 100, text: "            return AuthResult.deny(\"名册中无此主体\");" },
    { type: "ctx", n: 101, text: "        }" },
    { type: "del", n: 102, text: "        // TODO 校验该通行证所属机构是否被授权访问本次会议 meetingId" },
    { type: "del", n: 103, text: "        return AuthResult.pass(cn);" },
    { type: "add", n: 102, text: "        // 名册存在性只能证明「此人是股东」，不能证明「此人有权看这场会议」：" },
    { type: "add", n: 103, text: "        // 缺这一步，A 机构的合法通行证即可读取 B 机构同场会议的名册。" },
    { type: "add", n: 104, text: "        if (!authzScope.allows(entry.getOrgId(), meetingId)) {" },
    { type: "add", n: 105, text: "            auditLogger.deny(cert, meetingId, \"机构未被授权访问本次会议\", MDC.get(\"traceId\"));" },
    { type: "add", n: 106, text: "            return AuthResult.deny(\"该机构未被授权访问本次会议\");" },
    { type: "add", n: 107, text: "        }" },
    { type: "add", n: 108, text: "        auditLogger.success(cn, meetingId, MDC.get(\"traceId\"));" },
    { type: "add", n: 109, text: "        return AuthResult.pass(cn);" },
    { type: "ctx", n: 110, text: "    }" },
  ],
  /* 阻断项 3：异常栈不外泄 + 日志掩码。原实现把 ex.getMessage() 与堆栈直接写进
     500 响应体，而校验异常的 message 形如「证件号 3101011990… 不在名册中」；
     与阻断项 1 的路由绕过叠加后，构成「未认证即可读到明文证件号」的完整外泄链。
     整改后响应体只回 code 与 requestId，堆栈只入服务端日志且经掩码。 */
  "src/main/java/com/sse/vote/qfii/web/GlobalExceptionHandler.java": [
    { type: "hunk", text: "@@ -64,22 +64,34 @@ public class GlobalExceptionHandler" },
    { type: "ctx", n: 64, text: "    @ExceptionHandler(Exception.class)" },
    { type: "ctx", n: 65, text: "    public ResponseEntity<Map<String, Object>> onError(Exception ex) {" },
    { type: "ctx", n: 66, text: "        Map<String, Object> body = new LinkedHashMap<>();" },
    { type: "add", n: 67, text: "        String requestId = MDC.get(\"traceId\");" },
    { type: "ctx", n: 68, text: "        body.put(\"code\", 500);" },
    { type: "ctx", n: 69, text: "        body.put(\"message\", \"服务处理失败，请联系平台并提供请求编号\");" },
    { type: "del", n: 70, text: "        // 便于前端排查：把原始异常信息与堆栈一并回传" },
    { type: "del", n: 71, text: "        body.put(\"detail\", ex.getMessage());" },
    { type: "del", n: 72, text: "        body.put(\"trace\", ex.getStackTrace());" },
    { type: "add", n: 70, text: "        // 响应体只回可对账的请求编号：detail 与 trace 都是内部事实，" },
    { type: "add", n: 71, text: "        // 对未认证调用方同样可见，一旦携带证件号即构成明文外泄。" },
    { type: "add", n: 72, text: "        body.put(\"requestId\", requestId);" },
    { type: "ctx", n: 73, text: "" },
    { type: "del", n: 74, text: "        log.error(\"未捕获异常\", ex);" },
    { type: "add", n: 74, text: "        // 堆栈只入服务端日志，且经证件号掩码；logback 侧另有 %replace 兜底。" },
    { type: "add", n: 75, text: "        log.error(\"未捕获异常 requestId={} type={} detail={}\", requestId," },
    { type: "add", n: 76, text: "                ex.getClass().getSimpleName(), MaskUtil.maskIdCard(ex.getMessage()), ex);" },
    { type: "ctx", n: 77, text: "        return ResponseEntity.status(500).body(body);" },
    { type: "ctx", n: 78, text: "    }" },
    { type: "ctx", n: 79, text: "" },
    { type: "add", n: 80, text: "    /** 参数校验异常同样不得回显原值：RosterEntryValidator 抛出的 message" },
    { type: "add", n: 81, text: "     *  内含原始证件号，直接回传等于把名册字段暴露给调用方。 */" },
    { type: "add", n: 82, text: "    @ExceptionHandler(RosterValidationException.class)" },
    { type: "add", n: 83, text: "    public ResponseEntity<Map<String, Object>> onRosterInvalid(RosterValidationException ex) {" },
    { type: "add", n: 84, text: "        log.warn(\"名册校验失败 requestId={} field={}\", MDC.get(\"traceId\"), ex.getField());" },
    { type: "add", n: 85, text: "        return ResponseEntity.badRequest().body(Map.of(" },
    { type: "add", n: 86, text: "                \"code\", 400," },
    { type: "add", n: 87, text: "                \"message\", \"名册字段校验失败\"," },
    { type: "add", n: 88, text: "                \"field\", ex.getField()," },
    { type: "add", n: 89, text: "                \"requestId\", MDC.get(\"traceId\")));" },
    { type: "add", n: 90, text: "    }" },
  ],
};

/* 证据链：审核类任务的证据要回答一个额外问题 —— 结论分级是否成立。
   因此 review 类证据必须把阻断项与建议项的条数分开写：合成一个「5 个问题」的
   数字，就把「哪些必须整改、哪些由人取舍」的判断责任又推回给了人。
   前 5 条已闭环，末 2 条刻意未闭环：外部系统过渡期方案与合并审批都在人工检查层。 */
const evidence: EvidenceItem[] = [
  {
    id: "rv-ev-1",
    kind: "change",
    title: "7 个文件变更 · +212 −33（含第 2 轮定向返工 +37 −12）",
    source: "git.corp/sse/vote_org_qfii · MR!482",
    version: "review/ekey-auth-audit@e5b7c92",
    at: "10:24",
    actor: "开发智能体 · dev-3",
    confirmed: true,
    required: true,
  },
  {
    id: "rv-ev-2",
    kind: "toolcall",
    title: "只读检索 11 次 · 路由枚举 57 条，无凭证可达由 2 条降至 0 条",
    source: "受控连接层审计 · 代码仓库平台（readonly）",
    version: "trc-9c41e07f / audit-2026-08-13",
    at: "09:21",
    actor: "受控连接层",
    confirmed: true,
    required: true,
  },
  {
    id: "rv-ev-3",
    kind: "test",
    title: "复核第 1 轮 34 passed / 3 failed（脱敏、异常栈、审计留痕未过）",
    source: "ci.corp/pipeline/9418",
    version: "run#9418",
    at: "10:11",
    actor: "确定性程序",
    confirmed: true,
    required: true,
  },
  {
    id: "rv-ev-4",
    kind: "test",
    title: "复核第 2 轮 43 passed / 0 failed · 越权用例 9 例全部 403",
    source: "ci.corp/pipeline/9426",
    version: "run#9426",
    at: "10:33",
    actor: "测试智能体 · security-1",
    confirmed: true,
    required: true,
  },
  {
    id: "rv-ev-5",
    kind: "scan",
    title: "sensitive-log 扫描 214 文件 0 命中（上一轮 2 条）· spotbugs 0 high",
    source: "scan.corp/sast/2481",
    version: "sast#2481",
    at: "10:34",
    actor: "确定性程序",
    confirmed: true,
    required: true,
  },
  {
    id: "rv-ev-6",
    kind: "review",
    title: "独立审查：阻断项 3 项已整改闭环 / 建议项 2 项未处理（待责任人取舍）",
    source: "审查智能体 · review-sec-2（独立于开发智能体）",
    version: "review#627",
    at: "10:36",
    actor: "审查智能体 · review-sec-2",
    confirmed: false,
    required: true,
  },
  {
    id: "rv-ev-7",
    kind: "approval",
    title: "合并审批 review/ekey-auth-audit → main（待外部系统过渡期方案）",
    source: "project.corp/approval · MR!482",
    version: "—",
    at: "待放行",
    actor: "项目负责人",
    confirmed: false,
    required: true,
  },
];

/* 任务回放：审核类任务的回放要能自证「审查者没动过代码」——
   rv-rp-2 至 rv-rp-5 的 tier 全是 readonly，写权限只出现在定向整改两步。
   rv-rp-6 的 denied 是受控生效的证明；rv-rp-9 的 fail 触发定向返工，
   问题回到「定向整改」这个产生它的节点，而不是整条链重跑。 */
const replay: ReplayStep[] = [
  { id: "rv-rp-1", at: "09:12", stage: "任务契约", actor: "责任人", action: "确认审核范围限于 auth 包越权与脱敏，结论须分阻断/建议", materials: "contract@rv-v1", tier: "—", result: "ok" },
  { id: "rv-rp-2", at: "09:18", stage: "差异获取", actor: "受控连接层", action: "只读拉取 MR!482 差异、auth 包全量文件与项目规则", materials: "vote_org_qfii@d41f8a3", tier: "readonly", result: "ok" },
  { id: "rv-rp-3", at: "09:26", stage: "功能与边界审查", actor: "审查智能体", action: "反向枚举调用链，命中 /api/v2/** 整段 exclude 绕过校验", materials: "grep · 6 files / 17 matches", tier: "readonly", result: "ok" },
  { id: "rv-rp-4", at: "09:33", stage: "功能与边界审查", actor: "审查智能体", action: "定位 L88 fail-open 与 L131 授权范围 TODO，meetingId 未参与裁决", materials: "EkeyAuthenticator.java L74-138", tier: "readonly", result: "ok" },
  { id: "rv-rp-5", at: "09:41", stage: "安全与合规审查", actor: "审查智能体", action: "追踪证件号外泄面，定位 6 处出口未掩码、2 处回传异常栈", materials: "grep · 9 files / 24 matches", tier: "readonly", result: "ok" },
  { id: "rv-rp-6", at: "09:47", stage: "受控调用", actor: "受控连接层", action: "尝试读取生产日志归档以核对明文证件号是否已落盘", materials: "prod.log.archive.read", tier: "highrisk", result: "denied" },
  { id: "rv-rp-7", at: "09:54", stage: "问题汇总", actor: "主控智能体", action: "收敛为阻断项 3 项（各带回退目标）与建议项 2 项", materials: "review#627 · handoff@rv10", tier: "—", result: "ok" },
  { id: "rv-rp-8", at: "10:08", stage: "定向整改", actor: "开发智能体", action: "Filter 注册收口、fail-open 改 deny、补机构与会议授权范围校验", materials: "diff@175/21", tier: "write", result: "ok" },
  { id: "rv-rp-9", at: "10:11", stage: "复核放行", actor: "确定性程序", action: "3 个维度未通过：异常响应体仍回明文，deny 分支审计缺 15 条", materials: "run#9418 · gate@rv14", tier: "readonly", result: "fail" },
  { id: "rv-rp-10", at: "10:24", stage: "定向整改", actor: "开发智能体", action: "第 2 轮仅动外泄面与留痕侧 3 文件，已闭封堵结论不重做", materials: "rework#2 · diff@37/12", tier: "write", result: "ok" },
];

/* 终端现场：审核的可复算过程 ——
   先用 grep 把「谁绕过了校验」枚举成一张可数的清单（这是阻断项 1 成立的依据），
   再用 mvn 安全用例与敏感字段扫描证明整改后清单归零。
   审查阶段没有任何写操作，git status 的干净输出本身就是「只读审查」的证据。 */
const terminal: string[] = [
  "agentflow@sandbox  ~/workspace/vote_org_qfii  (review/ekey-auth-audit)",
  "$ git status --short   # 审查阶段只读，工作区应无改动",
  " nothing to commit, working tree clean",
  "",
  "$ grep -rn 'excludePathPatterns' src/main/java --include=*.java",
  " config/WebMvcConfig.java:42  .excludePathPatterns(\"/qfii/**/health\", \"/api/v2/**\");",
  "",
  "$ grep -rn '@GetMapping(\"/api/v2' src/main/java --include=*.java",
  " roster/RosterQueryController.java:38     /api/v2/qfii/roster/export            ← 命中 exclude",
  " collect/ResultDownloadController.java:29 /api/v2/qfii/collect/result/download  ← 命中 exclude",
  " 越权可达路由 2 条 / 路由总数 57 条",
  "",
  "$ grep -rnE 'idCardNo=|getStackTrace|toJSONString' src/main/java | wc -l",
  " 6   # 证件号未掩码出口 6 处，其中 2 处直接进入 HTTP 响应体",
  "",
  "$ mvn -q -Dtest='EkeyAuth*Test,GlobalExceptionHandlerTest' test -Dsast.rules=sensitive-log",
  " [ERROR] 未认证请求_500响应体不得含证件号        期望 0 命中，实际 2 命中",
  " [ERROR] deny分支审计条数_应等于拒绝次数         期望 41，实际 26",
  " Tests run: 37, Failures: 3, Errors: 0, Skipped: 0  ·  5.24s",
  "",
  "$ mvn clean test -Dspotbugs.skip=false -Dsast.rules=sensitive-log   # 第 2 轮返工后",
  " EkeyAuthFilterSecurityTest   (16 tests) 1.84s   403 越权用例 9 例全通过",
  " EkeyAuthenticatorTest        (14 tests) 0.51s   过期 / 吊销 / 跨机构 全部 deny",
  " AuthAuditLoggerTest           (6 tests) 0.22s   deny 分支落库 41/41，均含 traceId",
  " [INFO] sast · sensitive-log：扫描 214 文件，命中 0 条（上一轮 2 条）",
  " Tests run: 43, Failures: 0, Errors: 0, Skipped: 0  ·  BUILD SUCCESS 6.12s",
  "",
  "$ grep -c 'api/v2' target/route-inventory.txt   # 复核：白名单外无凭证可达",
  " 0",
  "",
];

/** 代码审核（wf-review）的检查面板现场 */
export const reviewBundle: InspectorBundle = { files, diffs, evidence, replay, terminal };
