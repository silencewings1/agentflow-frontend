/* ---------------------- 单元测试（wf-unit）的检查面板现场 ----------------------
   这套现场要和 streams/unit.ts 讲同一件事：**覆盖率是结果，断言才是证据**。
   因此五类数据都围绕「无断言 → 有效断言」这条返工线索组织：

     files     改动以 src/test/java 下的测试类为主（added），实现文件只有被
               用例逼出来的最小修复（modified）—— 用例是标准，实现才是被改的一方
     diffs     逐行呈现第 2 轮返工：del 掉 assertDoesNotThrow 与「只调不断言」，
               add 上逐行 assertEquals 与字段级 assertThat
     evidence  第 1 轮与第 2 轮的测试结果各留一条，让「覆盖率掉到 83.4%」这个
               事实留在链上，而不是被达标结论覆盖掉
     replay    含一步 fail 是刻意的：边界用例必须先在未修复实现上稳定失败，
               失败输出才是它真的覆盖到那条分支的证据
     terminal  jacoco 报告 + 断言检查告警的现场，告警是门禁判 fail 的原始输入

   业务背景：QFII 投票项目股东名册上传（仓库 vote_org_qfii，分支
   test/upload-edges，包 com.sse.vote.qfii.upload）补齐 GBK 编码、证件号字段
   缺列、非持有人越权上传三类边界分支。
   --------------------------------------------------------------------------- */

import type { DiffLine, FileNode } from "../mock";
import type { EvidenceItem, ReplayStep } from "../settings";
import type { InspectorBundle } from "./bundle";

/* 文件树：测试类是本次的主体产出，实现侧只有三处被用例暴露的缺陷修复。
   路径与 streams/unit.ts 中 ut5 / ut14 两次 diff 的 files 列表一致。 */
const files: FileNode[] = [
  {
    name: "src/main/java/com/sse/vote/qfii/upload",
    kind: "dir",
    children: [
      /* 编码硬编码、静默跳行、权限 TODO 三处缺陷的修复，改动量刻意小于测试 */
      { name: "RosterParser.java", kind: "file", status: "modified", lines: 96 },
      { name: "RosterUploadService.java", kind: "file", status: "modified", lines: 118 },
      { name: "RosterColumnMissingException.java", kind: "file", status: "added", lines: 24 },
      { name: "RosterRow.java", kind: "file", lines: 38 },
    ],
  },
  {
    name: "src/test/java/com/sse/vote/qfii/upload",
    kind: "dir",
    children: [
      { name: "RosterParserEncodingTest.java", kind: "file", status: "added", lines: 96 },
      { name: "RosterParserColumnTest.java", kind: "file", status: "added", lines: 62 },
      { name: "RosterUploadAuthTest.java", kind: "file", status: "added", lines: 84 },
      /* 既有正常路径用例未被改动：返工只补断言，不重做已有效的部分 */
      { name: "RosterParserTest.java", kind: "file", lines: 88 },
    ],
  },
  {
    name: "src/test/resources/roster",
    kind: "dir",
    children: [
      { name: "roster-gbk.csv", kind: "file", status: "added", lines: 12 },
      { name: "roster-gbk-2000.csv", kind: "file", status: "added", lines: 2000 },
      { name: "roster-utf8-bom.csv", kind: "file", status: "added", lines: 12 },
      { name: "roster-missing-idno.csv", kind: "file", status: "added", lines: 9 },
    ],
  },
  { name: "pom.xml", kind: "file", status: "modified", lines: 214 },
  { name: "AGENTS.md", kind: "file" },
];

/* diffs：key 与上面 files 拼出的路径逐字一致（目录名 + "/" + 文件名）。
   三个测试文件呈现的都是第 2 轮返工的补断言改动，实现文件呈现被用例逼出的修复。 */
const diffs: Record<string, DiffLine[]> = {
  /* 编码用例：assertDoesNotThrow 是典型的「覆盖到了但什么也没验证」写法，
     它能把行覆盖率推上去，却对乱码结果照样判通过 —— 必须换成逐行比对。 */
  "src/test/java/com/sse/vote/qfii/upload/RosterParserEncodingTest.java": [
    { type: "hunk", text: "@@ -27,14 +27,23 @@ class RosterParserEncodingTest" },
    { type: "ctx", n: 27, text: "    @Test" },
    { type: "ctx", n: 28, text: "    @DisplayName(\"GBK 大名册应逐行解析出正确的持有人名称与证件号\")" },
    { type: "ctx", n: 29, text: "    void gbkLargeRoster_parsesEveryRow() throws Exception {" },
    { type: "ctx", n: 30, text: "        var in = resource(\"/roster/roster-gbk-2000.csv\");" },
    { type: "ctx", n: 31, text: "" },
    { type: "del", n: 32, text: "        // 第 1 轮写法：只断言「没抛异常」，解析出乱码同样算通过" },
    { type: "del", n: 33, text: "        assertDoesNotThrow(() -> parser.parse(in, \"M20260930001\"));" },
    { type: "del", n: 34, text: "    }" },
    { type: "add", n: 32, text: "        var rows = parser.parse(in, \"M20260930001\").rows();" },
    { type: "add", n: 33, text: "" },
    { type: "add", n: 34, text: "        assertEquals(2000, rows.size(), \"GBK 名册应解析出全部 2000 行\");" },
    { type: "add", n: 35, text: "        assertEquals(\"中国工商银行股份有限公司\", rows.get(0).holderName());" },
    { type: "add", n: 36, text: "        assertEquals(\"91110000100003962T\", rows.get(0).idNo());" },
    { type: "add", n: 37, text: "        assertEquals(\"摩根士丹利国际股份有限公司\", rows.get(1999).holderName());" },
    { type: "add", n: 38, text: "        assertThat(rows).extracting(RosterRow::holderName)" },
    { type: "add", n: 39, text: "            .noneMatch(name -> name.contains(\"\\uFFFD\")); // 乱码替换符不得出现" },
    { type: "add", n: 40, text: "    }" },
    { type: "hunk", text: "@@ -49,9 +58,10 @@ 编码识别应覆盖 UTF-8 / UTF-8 BOM / GBK" },
    { type: "ctx", n: 58, text: "    void bomRoster_stripsMarkAndKeepsFirstHolder() throws Exception {" },
    { type: "ctx", n: 59, text: "        var first = parser.parse(resource(\"/roster/roster-utf8-bom.csv\")," },
    { type: "ctx", n: 60, text: "                \"M20260930001\").rows().get(0);" },
    { type: "ctx", n: 61, text: "" },
    { type: "del", n: 62, text: "        // contains 在乱码前缀相同时无法判失败，属于弱断言" },
    { type: "del", n: 63, text: "        assertThat(first.holderName()).contains(\"中国工商银行\");" },
    { type: "add", n: 62, text: "        assertEquals(\"中国工商银行股份有限公司\", first.holderName());" },
    { type: "add", n: 63, text: "        assertEquals(\"91110000100003962T\", first.idNo());" },
    { type: "ctx", n: 64, text: "    }" },
  ],

  /* 缺列用例：第 1 轮只断言了异常类型，没断言消息里带缺失列名，
     上传方仍然拿不到「哪一列缺了」这个可行动的信息。 */
  "src/test/java/com/sse/vote/qfii/upload/RosterParserColumnTest.java": [
    { type: "hunk", text: "@@ -21,12 +21,19 @@ class RosterParserColumnTest" },
    { type: "ctx", n: 21, text: "    @Test" },
    { type: "ctx", n: 22, text: "    @DisplayName(\"缺少证件号列应抛出 RosterColumnMissingException 且消息含列名\")" },
    { type: "ctx", n: 23, text: "    void missingIdNoColumn_throwsWithColumnName() {" },
    { type: "ctx", n: 24, text: "        var in = resource(\"/roster/roster-missing-idno.csv\");" },
    { type: "ctx", n: 25, text: "" },
    { type: "del", n: 26, text: "        // 第 1 轮写法：只断言异常类型，消息内容未被验证" },
    { type: "del", n: 27, text: "        assertThrows(RosterColumnMissingException.class," },
    { type: "del", n: 28, text: "                () -> parser.parse(in, \"M20260930001\"));" },
    { type: "add", n: 26, text: "        var ex = assertThrows(RosterColumnMissingException.class," },
    { type: "add", n: 27, text: "                () -> parser.parse(in, \"M20260930001\"));" },
    { type: "add", n: 28, text: "" },
    { type: "add", n: 29, text: "        assertThat(ex.getMessage()).contains(\"证件号\");" },
    { type: "add", n: 30, text: "        assertEquals(\"证件号\", ex.missingColumn());" },
    { type: "add", n: 31, text: "        assertEquals(2, ex.headerLine());" },
    { type: "ctx", n: 32, text: "    }" },
    { type: "ctx", n: 33, text: "" },
    { type: "ctx", n: 34, text: "    @Test" },
    { type: "ctx", n: 35, text: "    @DisplayName(\"缺列时不得静默跳行：已解析行数必须为 0\")" },
    { type: "ctx", n: 36, text: "    void missingColumn_doesNotSilentlySkipRows() {" },
    { type: "add", n: 37, text: "        assertEquals(0, parser.lastParsedRowCount());" },
    { type: "ctx", n: 38, text: "    }" },
  ],

  /* 越权用例：审计记录「只调不断言」等于没验证 —— 落没落审计、落了什么字段
     都不可知。返工后按操作人 / 会议编号 / 拒绝原因三项字段逐一断言。 */
  "src/test/java/com/sse/vote/qfii/upload/RosterUploadAuthTest.java": [
    { type: "hunk", text: "@@ -38,12 +38,27 @@ class RosterUploadAuthTest" },
    { type: "ctx", n: 38, text: "    @Test" },
    { type: "ctx", n: 39, text: "    @DisplayName(\"非该会议名义持有人上传应被拒绝并落一条审计\")" },
    { type: "ctx", n: 40, text: "    void nonNomineeUpload_rejectedWithAudit() {" },
    { type: "ctx", n: 41, text: "        var req = uploadReq(\"QF0007\", \"M20260930001\", \"/roster/roster-gbk.csv\");" },
    { type: "ctx", n: 42, text: "        var resp = service.upload(req);" },
    { type: "ctx", n: 43, text: "" },
    { type: "ctx", n: 44, text: "        assertEquals(4030, resp.code());" },
    { type: "del", n: 45, text: "        // 第 1 轮写法：审计只查不断言，写没写进去无从判断" },
    { type: "del", n: 46, text: "        auditRepository.findByTrace(resp.traceId());" },
    { type: "del", n: 47, text: "    }" },
    { type: "add", n: 45, text: "        assertEquals(\"上传方非本次会议名义持有人\", resp.message());" },
    { type: "add", n: 46, text: "" },
    { type: "add", n: 47, text: "        var audits = auditRepository.findByTrace(resp.traceId());" },
    { type: "add", n: 48, text: "        assertThat(audits).hasSize(1);" },
    { type: "add", n: 49, text: "        assertThat(audits.get(0))" },
    { type: "add", n: 50, text: "            .extracting(AuditRecord::operator, AuditRecord::meetingId, AuditRecord::reason)" },
    { type: "add", n: 51, text: "            .containsExactly(\"QF0007\", \"M20260930001\", \"NOT_NOMINEE_HOLDER\");" },
    { type: "add", n: 52, text: "    }" },
    { type: "add", n: 53, text: "" },
    { type: "add", n: 54, text: "    @Test  // 补覆盖 RosterUploadService 剩余分支：拒绝后审计写入失败" },
    { type: "add", n: 55, text: "    @DisplayName(\"越权拒绝后审计写入失败应上抛而不静默\")" },
    { type: "add", n: 56, text: "    void auditWriteFailure_propagates() {" },
    { type: "add", n: 57, text: "        doThrow(new DataAccessException(\"audit db down\"))" },
    { type: "add", n: 58, text: "            .when(auditRepository).save(any(AuditRecord.class));" },
    { type: "add", n: 59, text: "" },
    { type: "add", n: 60, text: "        var ex = assertThrows(AuditWriteException.class, () -> service.upload(" },
    { type: "add", n: 61, text: "                uploadReq(\"QF0007\", \"M20260930001\", \"/roster/roster-gbk.csv\")));" },
    { type: "add", n: 62, text: "        assertThat(ex.getMessage()).contains(\"audit db down\");" },
    { type: "add", n: 63, text: "    }" },
  ],

  /* 实现侧修复：编码按 BOM 与字节特征识别，缺列改为抛带列名的业务异常。
     这两处都是被上面的失败用例逼出来的，不是主动重构。 */
  "src/main/java/com/sse/vote/qfii/upload/RosterParser.java": [
    { type: "hunk", text: "@@ -38,7 +38,14 @@ public RosterResult parse(InputStream in, String meetingId)" },
    { type: "ctx", n: 38, text: "    public RosterResult parse(InputStream in, String meetingId) {" },
    { type: "ctx", n: 39, text: "        var buffered = new BufferedInputStream(in);" },
    { type: "del", n: 40, text: "        // 编码硬编码：GBK 名册会被读成乱码持有人名称" },
    { type: "del", n: 41, text: "        var reader = new InputStreamReader(buffered, StandardCharsets.UTF_8);" },
    { type: "add", n: 40, text: "        // 按 BOM 与字节特征识别，范围限定 UTF-8 / UTF-8 BOM / GBK" },
    { type: "add", n: 41, text: "        var charset = EncodingDetector.detect(buffered);" },
    { type: "add", n: 42, text: "        var reader = new InputStreamReader(buffered, charset);" },
    { type: "hunk", text: "@@ -85,8 +92,12 @@ private RosterRow readRow(String[] cells)" },
    { type: "ctx", n: 92, text: "        int idx = header.indexOf(\"证件号\");" },
    { type: "del", n: 93, text: "        if (idx < 0) { continue; }  // 列缺失静默跳行：上传方只看到「少了几行」" },
    { type: "add", n: 93, text: "        if (idx < 0) {" },
    { type: "add", n: 94, text: "            parsedRowCount = 0;" },
    { type: "add", n: 95, text: "            throw new RosterColumnMissingException(\"证件号\", headerLine);" },
    { type: "add", n: 96, text: "        }" },
  ],
};

/* 证据链：第 1 轮与第 2 轮的测试结果都在链上。
   保留第 1 轮那条（含 83.4% 的剔除后覆盖率）是有意的 —— 结论可回溯的前提是
   被推翻的那个数字也还在。未闭环两条：测试样本脱敏与交付审批。 */
const evidence: EvidenceItem[] = [
  {
    id: "ut-ev-1",
    kind: "change",
    title: "11 个文件变更 · +239 −9（测试类 7 个）",
    source: "git.corp/sse/vote_org_qfii",
    version: "test/upload-edges@c47ba90",
    at: "09:58",
    actor: "测试智能体",
    confirmed: true,
    required: true,
  },
  {
    id: "ut-ev-2",
    kind: "toolcall",
    title: "受控调用 11 次 · 高风险写入 0 次",
    source: "受控连接层审计",
    version: "audit-2026-08-13",
    at: "10:03",
    actor: "受控连接层",
    confirmed: true,
    required: true,
  },
  {
    id: "ut-ev-3",
    kind: "test",
    title: "第 1 轮 20 passed · 行 88.6% · 3 例无有效断言 · 剔除后 83.4% 不达阈值",
    source: "ci.corp/vote_org_qfii/surefire+jacoco",
    version: "run#8871",
    at: "10:03",
    actor: "确定性程序",
    confirmed: true,
    required: true,
  },
  {
    id: "ut-ev-4",
    kind: "test",
    title: "第 2 轮 23 passed · 断言有效 23/23 · 行 93.2% / 分支 89.6%",
    source: "ci.corp/vote_org_qfii/surefire+jacoco",
    version: "run#8879",
    at: "10:23",
    actor: "确定性程序",
    confirmed: true,
    required: true,
  },
  {
    id: "ut-ev-5",
    kind: "review",
    title: "独立审查 6/6 维度通过（第 2 轮）· 1 次定向返工",
    source: "评审智能体 · review-2",
    version: "review#557",
    at: "10:24",
    actor: "评审智能体",
    confirmed: true,
    required: true,
  },
  {
    id: "ut-ev-6",
    kind: "scan",
    title: "测试样本扫描 0 阻断 · 1 提示：roster-gbk-2000.csv 含真实证件号待脱敏",
    source: "scan.corp/dlp/1183",
    version: "dlp#1183",
    at: "10:25",
    actor: "确定性程序",
    confirmed: false,
    required: true,
  },
  {
    id: "ut-ev-7",
    kind: "approval",
    title: "测试补充交付审批（历史 GBK 乱码名册回补范围待判定）",
    source: "project.corp/approval",
    version: "—",
    at: "待提交",
    actor: "项目负责人",
    confirmed: false,
    required: true,
  },
];

/* 任务回放：ut-rp-4 的 fail 不是事故而是要求 —— 边界用例必须先在未修复的实现上
   稳定失败，失败输出才证明它确实覆盖到了那条分支。ut-rp-6 的 fail 是门禁读断言
   而不读数字的结果：覆盖率数字达标，但构成不成立。 */
const replay: ReplayStep[] = [
  { id: "ut-rp-1", at: "09:26", stage: "任务契约", actor: "责任人", action: "确认边界范围、断言口径与覆盖率阈值", materials: "contract@v2", tier: "—", result: "ok" },
  { id: "ut-rp-2", at: "09:29", stage: "受控调用", actor: "受控连接层", action: "按只读权限读取 upload 包源码与既有用例", materials: "vote_org_qfii@c1740b2", tier: "readonly", result: "ok" },
  { id: "ut-rp-3", at: "09:41", stage: "单元测试开发", actor: "测试智能体", action: "为三类边界分支各写一条预期失败用例", materials: "diff@+198 −0", tier: "write", result: "ok" },
  { id: "ut-rp-4", at: "09:44", stage: "单元测试开发", actor: "确定性程序", action: "在未修复实现上跑三条用例，按预期失败", materials: "surefire#2141", tier: "readonly", result: "fail" },
  { id: "ut-rp-5", at: "09:58", stage: "单元测试开发", actor: "开发智能体", action: "按失败输出修复编码识别、缺列抛错与权限校验", materials: "diff@+41 −12", tier: "write", result: "ok" },
  { id: "ut-rp-6", at: "10:06", stage: "评审", actor: "评审智能体", action: "断言有效性与覆盖率构成审查，判 3 例无有效断言", materials: "review#552", tier: "—", result: "fail" },
  { id: "ut-rp-7", at: "10:07", stage: "评审", actor: "主控智能体", action: "沿回退边定向返工至单元测试开发，keep 已有效用例", materials: "rework#12", tier: "—", result: "ok" },
  { id: "ut-rp-8", at: "10:19", stage: "单元测试开发", actor: "测试智能体", action: "改逐行 assertEquals / 字段级 assertThat，补审计失败用例", materials: "diff@+41 −9", tier: "write", result: "ok" },
  { id: "ut-rp-9", at: "10:24", stage: "评审", actor: "评审智能体", action: "第 2 轮 6/6 维度通过，剔除项为 0", materials: "review#557", tier: "—", result: "ok" },
  { id: "ut-rp-10", at: "10:28", stage: "交付", actor: "项目负责人", action: "在收敛后的事实上判定是否交付", materials: "trc-9f42c6e1", tier: "highrisk", result: "wait" },
];

/* 终端现场：第 1 轮的原始输出。Tests run 全绿、覆盖率也过线，
   但断言检查的三条 WARNING 才是门禁判 fail 的输入 —— 这段现场存在的理由，
   就是让「数字达标」与「测试有效」在同一屏里对峙。 */
const terminal: string[] = [
  "agentflow@sandbox  ~/workspace/vote_org_qfii  (test/upload-edges)",
  "$ git status --short",
  " M src/main/java/com/sse/vote/qfii/upload/RosterParser.java",
  " M src/main/java/com/sse/vote/qfii/upload/RosterUploadService.java",
  " M pom.xml",
  "?? src/main/java/com/sse/vote/qfii/upload/RosterColumnMissingException.java",
  "?? src/test/java/com/sse/vote/qfii/upload/RosterParserEncodingTest.java",
  "?? src/test/java/com/sse/vote/qfii/upload/RosterParserColumnTest.java",
  "?? src/test/java/com/sse/vote/qfii/upload/RosterUploadAuthTest.java",
  "?? src/test/resources/roster/",
  "",
  "$ mvn -Dtest='RosterParser*Test,RosterUploadAuthTest' test -Djacoco.skip=false",
  " RosterParserTest          ·   6 tests, 0 failures  ·  0.19s",
  " RosterParserEncodingTest  ·   5 tests, 0 failures  ·  0.31s",
  " RosterParserColumnTest    ·   4 tests, 0 failures  ·  0.16s",
  " RosterUploadAuthTest      ·   5 tests, 0 failures  ·  0.44s",
  " Tests run: 20, Failures: 0, Errors: 0, Skipped: 0  ·  3.02s",
  "",
  "$ mvn -q jacoco:report && cat target/site/jacoco/summary.txt",
  " RosterParser.java         行 88.6% | 分支 81.2% | 方法 100%",
  " RosterUploadService.java  行 86.9% | 分支 78.4% | 方法 92.3%",
  " [WARNING] 3 个用例未包含任何 assert 调用（断言有效性检查）：",
  " [WARNING]   RosterParserEncodingTest#gbkLargeRoster_parsesEveryRow  仅 assertDoesNotThrow",
  " [WARNING]   RosterUploadAuthTest#nonNomineeUpload_rejectedWithAudit  审计只查不断言",
  " [WARNING] 剔除无断言用例贡献后 RosterParser 行覆盖 83.4% < 阈值 85%",
];

export const unitBundle: InspectorBundle = { files, diffs, evidence, replay, terminal };
