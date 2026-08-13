/* ==================== 开源漏洞整改（wf-cve）的检查面板现场 ====================
   这套现场要支撑 streams/cve.ts 里的核心主张：安全整改的可信度不在「版本号
   是否改了」，而在「运行期实际加载的是哪一份 jar」。

   因此五类数据都围绕依赖仲裁展开：
     files    改动集中在 pom.xml 与三处文件解析代码 —— 漏洞可达的地方
     diffs    pom.xml 同时呈现 exclusion 与 dependencyManagement 两处收敛手段，
              说明「只改直接依赖的版本号」为什么不够
     evidence 依赖扫描证据带 CVE 编号，且刻意留下 commons-fileupload 1.3.3
              未升级这一未闭环项 —— 证据链要能诚实地记录残留风险
     replay   回归验证出现一次 fail 后定向返工回整改实现，最后一步是高风险
              写入等待责任人放行（AI 只能请求，不能代替）
     terminal 保留返工前后两次 dependency:tree 的对照，omitted for conflict
              这一行就是第 1 轮被门禁拦下的物证

   注：diffs 呈现的是返工后的最终状态，因此增删行数比事件流 cv8（第 1 轮）更多。
   ========================================================================= */

import type { DiffLine, FileNode } from "../mock";
import type { EvidenceItem, ReplayStep } from "../settings";
import type { InspectorBundle } from "./bundle";

/* 文件树：根目录的 pom.xml 是本次整改的主体，其余是漏洞调用链穿过的解析代码。
   auth / api 两个包不带 status —— 它们只提供可达性判定的上下文，本次未改动。 */
const files: FileNode[] = [
  { name: "pom.xml", kind: "file", status: "modified", lines: 214 },
  {
    name: "src/main/java/com/sse/vote/qfii",
    kind: "dir",
    children: [
      {
        name: "common",
        kind: "dir",
        children: [
          { name: "JsonConfig.java", kind: "file", status: "modified", lines: 38 },
        ],
      },
      {
        name: "upload",
        kind: "dir",
        children: [
          { name: "RosterParser.java", kind: "file", status: "modified", lines: 88 },
        ],
      },
      {
        name: "export",
        kind: "dir",
        children: [
          { name: "CollectResultExporter.java", kind: "file", status: "modified", lines: 71 },
        ],
      },
      {
        name: "auth",
        kind: "dir",
        children: [
          /* 通行证 payload 的反序列化入口：safeMode 关停后行为随之收敛，代码本身未改 */
          { name: "PassportTokenCodec.java", kind: "file", lines: 52 },
        ],
      },
      {
        name: "api",
        kind: "dir",
        children: [
          /* 平台回执结构固定，单独看不可达，保留在树里是为了让判定范围可核对 */
          { name: "VoteReportClient.java", kind: "file", lines: 134 },
        ],
      },
    ],
  },
  {
    name: "src/test/java/com/sse/vote/qfii/upload",
    kind: "dir",
    children: [
      { name: "RosterPathTraversalTest.java", kind: "file", status: "added", lines: 31 },
    ],
  },
  {
    name: "src/main/resources",
    kind: "dir",
    children: [
      /* 对外报送契约：本次整改的硬约束是它零变更 */
      { name: "vote-org-api.yaml", kind: "file" },
    ],
  },
  { name: "AGENTS.md", kind: "file" },
];

/* diffs：key 与上方 files 的完整路径逐一对齐（Tree 用 prefix/name 拼路径）。
   pom.xml 给两段 hunk —— 第一段把含洞的传递依赖从 commons-fileupload 上排除，
   第二段用 dependencyManagement 固定仲裁结果，两者缺一都会让构建不可重现。 */
const diffs: Record<string, DiffLine[]> = {
  "pom.xml": [
    { type: "hunk", text: "@@ -38,21 +38,38 @@ <dependencies>" },
    { type: "ctx", n: 38, text: "  <dependencies>" },
    { type: "ctx", n: 39, text: "    <dependency>" },
    { type: "ctx", n: 40, text: "      <groupId>com.alibaba</groupId>" },
    { type: "ctx", n: 41, text: "      <artifactId>fastjson</artifactId>" },
    { type: "del", n: 42, text: "      <version>1.2.62</version>   <!-- CVE-2022-25845 AutoType 反序列化 -->" },
    { type: "add", n: 42, text: "      <version>1.2.83</version>" },
    { type: "ctx", n: 43, text: "    </dependency>" },
    { type: "ctx", n: 44, text: "    <dependency>" },
    { type: "ctx", n: 45, text: "      <groupId>commons-io</groupId>" },
    { type: "ctx", n: 46, text: "      <artifactId>commons-io</artifactId>" },
    { type: "del", n: 47, text: "      <version>2.4</version>      <!-- CVE-2021-29425 路径遍历 -->" },
    { type: "add", n: 47, text: "      <version>2.14.0</version>   <!-- 同时覆盖 CVE-2024-47554 -->" },
    { type: "ctx", n: 48, text: "    </dependency>" },
    { type: "ctx", n: 49, text: "    <dependency>" },
    { type: "ctx", n: 50, text: "      <groupId>commons-fileupload</groupId>" },
    { type: "ctx", n: 51, text: "      <artifactId>commons-fileupload</artifactId>" },
    { type: "ctx", n: 52, text: "      <version>1.3.3</version>" },
    { type: "add", n: 53, text: "      <!-- 1.3.3 传递引入 commons-io 2.2：只升直接依赖不足以消除漏洞，" },
    { type: "add", n: 54, text: "           必须先排除，再由 dependencyManagement 统一仲裁版本 -->" },
    { type: "add", n: 55, text: "      <exclusions>" },
    { type: "add", n: 56, text: "        <exclusion>" },
    { type: "add", n: 57, text: "          <groupId>commons-io</groupId>" },
    { type: "add", n: 58, text: "          <artifactId>commons-io</artifactId>" },
    { type: "add", n: 59, text: "        </exclusion>" },
    { type: "add", n: 60, text: "      </exclusions>" },
    { type: "ctx", n: 61, text: "    </dependency>" },
    { type: "ctx", n: 62, text: "  </dependencies>" },
    { type: "hunk", text: "@@ -74,2 +91,15 @@ </dependencies>" },
    { type: "add", n: 91, text: "  <dependencyManagement>" },
    { type: "add", n: 92, text: "    <dependencies>" },
    { type: "add", n: 93, text: "      <!-- 锁定仲裁结果：否则本地与流水线会因声明顺序得到不同版本 -->" },
    { type: "add", n: 94, text: "      <dependency>" },
    { type: "add", n: 95, text: "        <groupId>commons-io</groupId>" },
    { type: "add", n: 96, text: "        <artifactId>commons-io</artifactId>" },
    { type: "add", n: 97, text: "        <version>2.14.0</version>" },
    { type: "add", n: 98, text: "      </dependency>" },
    { type: "add", n: 99, text: "    </dependencies>" },
    { type: "add", n: 100, text: "  </dependencyManagement>" },
    { type: "ctx", n: 101, text: "  <build>" },
    { type: "ctx", n: 102, text: "    <plugins>" },
    { type: "add", n: 103, text: "      <!-- enforcer banDuplicateClasses：拦住重复打入的 commons-io jar -->" },
    { type: "ctx", n: 104, text: "      <plugin>" },
  ],
  "src/main/java/com/sse/vote/qfii/common/JsonConfig.java": [
    { type: "hunk", text: "@@ -10,14 +10,20 @@ public class JsonConfig" },
    { type: "ctx", n: 10, text: "@Configuration" },
    { type: "ctx", n: 11, text: "public class JsonConfig {" },
    { type: "ctx", n: 12, text: "" },
    { type: "ctx", n: 13, text: "    private static final Logger log = LoggerFactory.getLogger(JsonConfig.class);" },
    { type: "ctx", n: 14, text: "" },
    { type: "ctx", n: 15, text: "    @PostConstruct" },
    { type: "ctx", n: 16, text: "    public void init() {" },
    { type: "del", n: 17, text: "        // 历史配置：为兼容旧回执结构开了 AutoType，全局未设 safeMode" },
    { type: "del", n: 18, text: "        ParserConfig.getGlobalInstance().setAutoTypeSupport(true);" },
    { type: "add", n: 17, text: "        // CVE-2022-25845：safeMode 关闭时 @type 可指向任意类。通行证 payload" },
    { type: "add", n: 18, text: "        // 虽经签名校验，但密钥一旦泄露即可利用，故全局关停 AutoType。" },
    { type: "add", n: 19, text: "        ParserConfig.getGlobalInstance().setSafeMode(true);" },
    { type: "add", n: 20, text: "        ParserConfig.getGlobalInstance().setAutoTypeSupport(false);" },
    { type: "add", n: 21, text: "        ParserConfig.getGlobalInstance().addAccept(\"com.sse.vote.qfii.api.ReportAck\");" },
    { type: "add", n: 22, text: "        log.info(\"fastjson safeMode enabled, autoType disabled\");" },
    { type: "ctx", n: 23, text: "    }" },
    { type: "ctx", n: 24, text: "}" },
  ],
  "src/main/java/com/sse/vote/qfii/upload/RosterParser.java": [
    { type: "hunk", text: "@@ -58,18 +58,22 @@ public List<Holder> parse" },
    { type: "ctx", n: 58, text: "    /** 解析上传的持有人名册。文件名来自上传方，属外部输入。 */" },
    { type: "ctx", n: 59, text: "    public List<Holder> parse(MultipartFile file) throws IOException {" },
    { type: "ctx", n: 60, text: "        if (file.isEmpty()) {" },
    { type: "ctx", n: 61, text: "            throw new RosterUploadException(\"名册文件为空\");" },
    { type: "ctx", n: 62, text: "        }" },
    { type: "del", n: 63, text: "        // CVE-2021-29425：commons-io 2.4 的 normalize 对 //../ 前缀处理不完整," },
    { type: "del", n: 64, text: "        // 归一化后的路径仍可越出 stagingRoot" },
    { type: "del", n: 65, text: "        String name = FilenameUtils.normalize(file.getOriginalFilename());" },
    { type: "del", n: 66, text: "        File staged = new File(stagingRoot, name);" },
    { type: "add", n: 63, text: "        // 不再信任上传方给的文件名：只取扩展名做格式校验，落盘名由服务端生成。" },
    { type: "add", n: 64, text: "        // 这样即使归一化实现有缺陷，也不存在可被构造的路径片段。" },
    { type: "add", n: 65, text: "        String ext = FileTypes.requireAllowed(file.getOriginalFilename());" },
    { type: "add", n: 66, text: "        String name = StagedName.of(uploadId(), ext);" },
    { type: "add", n: 67, text: "        Path staged = stagingRoot.resolve(name).normalize();" },
    { type: "add", n: 68, text: "        if (!staged.startsWith(stagingRoot)) {" },
    { type: "add", n: 69, text: "            auditLogger.reject(\"roster.path.escape\", file.getOriginalFilename());" },
    { type: "add", n: 70, text: "            throw new RosterUploadException(\"名册文件名非法\");" },
    { type: "add", n: 71, text: "        }" },
    { type: "ctx", n: 72, text: "        file.transferTo(staged);" },
    { type: "ctx", n: 73, text: "        return parseWithLayout(staged, SSE_ROSTER_LAYOUT);" },
    { type: "ctx", n: 74, text: "    }" },
  ],
  "src/main/java/com/sse/vote/qfii/export/CollectResultExporter.java": [
    { type: "hunk", text: "@@ -46,14 +46,12 @@ public Path exportTo" },
    { type: "ctx", n: 46, text: "    /** 导出征集结果。fileName 由前端传入，历史上直接参与路径拼接。 */" },
    { type: "ctx", n: 47, text: "    public Path exportTo(String fileName, CollectResult result) throws IOException {" },
    { type: "del", n: 48, text: "        // concat 在 base 之外的片段上不做越界判断" },
    { type: "del", n: 49, text: "        String target = FilenameUtils.concat(exportRoot, fileName);" },
    { type: "del", n: 50, text: "        if (target == null) {" },
    { type: "del", n: 51, text: "            throw new ExportException(\"导出路径无效\");" },
    { type: "del", n: 52, text: "        }" },
    { type: "del", n: 53, text: "        return write(Paths.get(target), result);" },
    { type: "add", n: 48, text: "        // 只保留基础名，再用 startsWith 复核一次，越界即拒绝并落审计" },
    { type: "add", n: 49, text: "        Path target = exportRoot.resolve(Paths.get(fileName).getFileName()).normalize();" },
    { type: "add", n: 50, text: "        if (!target.startsWith(exportRoot)) {" },
    { type: "add", n: 51, text: "            auditLogger.reject(\"export.path.escape\", fileName);" },
    { type: "add", n: 52, text: "            throw new ExportException(\"导出路径越界\");" },
    { type: "add", n: 53, text: "        }" },
    { type: "ctx", n: 54, text: "        return write(target, result);" },
    { type: "ctx", n: 55, text: "    }" },
  ],
  "src/test/java/com/sse/vote/qfii/upload/RosterPathTraversalTest.java": [
    { type: "hunk", text: "@@ -0,0 +1,31 @@ new file" },
    { type: "add", n: 1, text: "package com.sse.vote.qfii.upload;" },
    { type: "add", n: 2, text: "" },
    { type: "add", n: 3, text: "/** 路径遍历回归用例：先复现 commons-io 2.4 下的越界，再断言升级后被拒。 */" },
    { type: "add", n: 4, text: "class RosterPathTraversalTest {" },
    { type: "add", n: 5, text: "" },
    { type: "add", n: 6, text: "    @ParameterizedTest" },
    { type: "add", n: 7, text: "    @ValueSource(strings = {" },
    { type: "add", n: 8, text: "        \"../../etc/passwd\"," },
    { type: "add", n: 9, text: "        \"//../roster.xlsx\",      // 2.4 的 normalize 对该前缀处理不完整" },
    { type: "add", n: 10, text: "        \"..\\\\..\\\\win.ini\"," },
    { type: "add", n: 11, text: "    })" },
    { type: "add", n: 12, text: "    void 越界文件名应被拒绝并落审计(String evil) {" },
    { type: "add", n: 13, text: "        var file = new MockMultipartFile(\"roster\", evil, XLSX, bytes());" },
    { type: "add", n: 14, text: "" },
    { type: "add", n: 15, text: "        assertThatThrownBy(() -> parser.parse(file))" },
    { type: "add", n: 16, text: "            .isInstanceOf(RosterUploadException.class);" },
    { type: "add", n: 17, text: "        assertThat(auditLogger.rejected()).contains(\"roster.path.escape\");" },
    { type: "add", n: 18, text: "    }" },
    { type: "add", n: 19, text: "" },
    { type: "add", n: 20, text: "    @Test" },
    { type: "add", n: 21, text: "    void AutoType载荷应被safeMode拒绝() {" },
    { type: "add", n: 22, text: "        String payload = \"{\\\"@type\\\":\\\"java.net.Inet4Address\\\",\\\"val\\\":\\\"x\\\"}\";" },
    { type: "add", n: 23, text: "" },
    { type: "add", n: 24, text: "        assertThatThrownBy(() -> JSON.parseObject(payload, Map.class))" },
    { type: "add", n: 25, text: "            .isInstanceOf(JSONException.class);" },
    { type: "add", n: 26, text: "    }" },
    { type: "add", n: 27, text: "}" },
  ],
};

/* 证据链：每条都带出处 / 版本 / 责任人三元组，缺一条结论就退化成断言。
   cv-ev-6、cv-ev-7 刻意留未闭环 —— commons-fileupload 1.3.3 自身未升级，
   以及生产发布仍等责任人放行，界面必须能体面地呈现「还差什么」。 */
const evidence: EvidenceItem[] = [
  {
    id: "cv-ev-1",
    kind: "scan",
    title: "依赖扫描命中 3 项：CVE-2022-25845 / CVE-2021-29425 / CVE-2024-47554",
    source: "scan.corp/sca/3417",
    version: "sca#3417 · fastjson 1.2.62 / commons-io 2.4",
    at: "09:08",
    actor: "确定性程序",
    confirmed: true,
    required: true,
  },
  {
    id: "cv-ev-2",
    kind: "toolcall",
    title: "依赖树取证 4 次 · 捕获 commons-io 2.2 传递引入",
    source: "受控连接层审计",
    version: "trc-a19d0f42 · mvn dependency:tree",
    at: "09:14",
    actor: "受控连接层",
    confirmed: true,
    required: true,
  },
  {
    id: "cv-ev-3",
    kind: "change",
    title: "5 个文件变更 · pom.xml 加 exclusion 与 dependencyManagement",
    source: "git.corp/sse/vote_org_qfii",
    version: "chore/cve-upgrade@7d3b0ac",
    at: "10:03",
    actor: "开发智能体",
    confirmed: true,
    required: true,
  },
  {
    id: "cv-ev-4",
    kind: "test",
    title: "单元与集成 152 passed · 路径遍历用例 9 条全拒",
    source: "ci.corp/pipeline/9126",
    version: "run#9126",
    at: "10:19",
    actor: "测试智能体",
    confirmed: true,
    required: true,
  },
  {
    id: "cv-ev-5",
    kind: "review",
    title: "独立审查：仲裁收敛成立 · 对外报送零变更",
    source: "审查智能体",
    version: "review#512",
    at: "10:22",
    actor: "审查智能体",
    confirmed: true,
    required: true,
  },
  {
    id: "cv-ev-6",
    kind: "scan",
    title: "复扫无高危 · commons-fileupload 1.3.3 旧版本残留待另立任务",
    source: "scan.corp/sca/3421",
    version: "sca#3421 · commons-io 2.14.0 唯一版本",
    at: "10:24",
    actor: "确定性程序",
    confirmed: false,
    required: true,
  },
  {
    id: "cv-ev-7",
    kind: "approval",
    title: "生产发布放行（高风险写入）",
    source: "release.corp/approval",
    version: "trc-c4e07b19",
    at: "待放行",
    actor: "sec-owner@agentflow.dev",
    confirmed: false,
    required: true,
  },
];

/* 任务回放：stage 只用这套编排的真实节点名与通用阶段。
   cv-rp-6 的 fail 是全流程的转折点 —— 直接依赖版本号已经对了，但依赖树与
   target/lib 的比对证明运行期仍可能加载 commons-io 2.2；随后只重跑
   整改实现 → 回归验证，可达性判定与兼容性核对的证据原样保留。 */
const replay: ReplayStep[] = [
  { id: "cv-rp-1", at: "09:02", stage: "任务契约", actor: "责任人", action: "确认整改范围：两条 CVE 与对外报送零变更", materials: "contract@cve-v2", tier: "—", result: "ok" },
  { id: "cv-rp-2", at: "09:08", stage: "影响排查", actor: "受控连接层", action: "按权限读取扫描报告与源码", materials: "sca#3417", tier: "readonly", result: "ok" },
  { id: "cv-rp-3", at: "09:14", stage: "依赖分析", actor: "架构智能体", action: "取依赖树，发现 commons-io 2.2 被传递引入", materials: "trc-a19d0f42", tier: "readonly", result: "ok" },
  { id: "cv-rp-4", at: "09:26", stage: "兼容性核对", actor: "架构智能体", action: "核对 fastjson 1.2.83 与 poi-ooxml 4.1.2、JDK 17", materials: "compat@v1", tier: "readonly", result: "ok" },
  { id: "cv-rp-5", at: "09:41", stage: "整改实现", actor: "开发智能体", action: "升级版本并开启 safeMode（第 1 轮）", materials: "diff@26/22", tier: "write", result: "ok" },
  { id: "cv-rp-6", at: "09:58", stage: "回归验证", actor: "确定性程序", action: "依赖树与 target/lib 比对：commons-io 2.2 仍在", materials: "run#9118", tier: "readonly", result: "fail" },
  { id: "cv-rp-7", at: "10:03", stage: "整改实现", actor: "开发智能体", action: "加 exclusion 与 dependencyManagement 收敛仲裁", materials: "diff@41/26", tier: "write", result: "ok" },
  { id: "cv-rp-8", at: "10:19", stage: "回归验证", actor: "确定性程序", action: "enforcer 通过 · 152 用例全通过", materials: "run#9126", tier: "readonly", result: "ok" },
  { id: "cv-rp-9", at: "10:24", stage: "安全复核", actor: "安全智能体", action: "复扫无高危，记入 commons-fileupload 残留项", materials: "sca#3421", tier: "readonly", result: "ok" },
  { id: "cv-rp-10", at: "10:28", stage: "发布审批", actor: "受控连接层", action: "发起生产发布，等待责任人放行", materials: "trc-c4e07b19", tier: "highrisk", result: "wait" },
];

/* 终端现场：刻意保留返工前后两次 dependency:tree 的对照。
   omitted for conflict 这一行是「只改版本号不够」的物证 —— 排除掉传递依赖后，
   同一条命令的输出才收敛为唯一版本，最后由 verify + enforcer 落定。 */
const terminal: string[] = [
  "agentflow@sandbox  ~/workspace/vote_org_qfii  (chore/cve-upgrade)",
  "$ git status --short",
  " M pom.xml",
  " M src/main/java/com/sse/vote/qfii/common/JsonConfig.java",
  " M src/main/java/com/sse/vote/qfii/upload/RosterParser.java",
  " M src/main/java/com/sse/vote/qfii/export/CollectResultExporter.java",
  "?? src/test/java/com/sse/vote/qfii/upload/RosterPathTraversalTest.java",
  "",
  "$ mvn dependency:tree -Dincludes=commons-io:commons-io    # 第 1 轮，仅改了版本号",
  " [INFO] +- commons-io:commons-io:jar:2.14.0:compile",
  " [INFO] \\- commons-fileupload:commons-fileupload:jar:1.3.3:compile",
  " [INFO]    \\- (commons-io:commons-io:jar:2.2:compile - omitted for conflict with 2.14.0)",
  " [WARNING] target/lib 同时存在 commons-io-2.2.jar 与 commons-io-2.14.0.jar，类加载顺序不确定",
  "",
  "$ mvn dependency:tree -Dincludes=commons-io:commons-io    # exclusion + dependencyManagement 之后",
  " [INFO] +- commons-io:commons-io:jar:2.14.0:compile  （唯一版本，来自 dependencyManagement）",
  " [INFO] \\- commons-fileupload:commons-fileupload:jar:1.3.3:compile",
  "",
  "$ mvn -U clean verify -Denforcer.skip=false",
  " [INFO] --- maven-enforcer-plugin:3.4.1:enforce (ban-duplicate-classes) ---",
  " [INFO] banDuplicateClasses 通过，未发现 org.apache.commons.io 重复类",
  " [INFO] target/lib: commons-io-2.14.0.jar, fastjson-1.2.83.jar",
  " Tests run: 152, Failures: 0, Errors: 0, Skipped: 2",
  " [INFO] BUILD SUCCESS  ·  Total time: 24.71s",
  "",
];

/** 开源漏洞整改（wf-cve）的检查面板现场 */
export const cveBundle: InspectorBundle = { files, diffs, evidence, replay, terminal };
