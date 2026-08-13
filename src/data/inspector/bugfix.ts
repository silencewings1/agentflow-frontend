/* ==================== 缺陷修复（wf-bugfix）的检查面板现场 ====================
   这套现场要与 data/streams/bugfix.ts 的事件流互为印证：事件流讲的是
   「先有可复现的失败，再谈根因与修复」，检查面板则要让这条叙事可核验 ——
   文件树给出改动边界、diff 给出裁决逻辑本身、证据链给出出处与责任人、
   回放给出「哪一步失败、失败之后去了哪里」、终端给出可复算的现场。

   业务背景：QFII 投票项目（Java / Maven，仓库 vote_org_qfii，分支
   fix/duplicate-vote-order，包名 com.sse.vote.qfii）中，多通道重复投票未按
   「时间优先」以第一次为准 —— 唯一约束冲突后直接覆盖存量记录，未比较
   vote_time，同秒提交保留了后到的一条。修复只动冲突分支：比对 vote_time
   取最早，同秒时以平台受理序号 accept_seq 兜底。
   ========================================================================= */

import type { DiffLine, FileNode } from "../mock";
import type { EvidenceItem, ReplayStep } from "../settings";
import type { InspectorBundle } from "./bundle";

/* 文件树：路径与事件流 bf7 的 diff 文件列表逐一对应。
   带 status 的三个文件即本次改动边界 —— 通道入口（VoteRecordWriter）与对外
   报送契约（vote-org-api.yaml）不带标记，这是「最小修复」在界面上的证据。 */
const files: FileNode[] = [
  {
    name: "src/main/java/com/sse/vote/qfii",
    kind: "dir",
    children: [
      {
        name: "collect",
        kind: "dir",
        children: [
          { name: "DuplicateVoteChecker.java", kind: "file", status: "modified", lines: 118 },
          { name: "VoteRecordWriter.java", kind: "file", lines: 86 },
          { name: "CollectWindowService.java", kind: "file", lines: 94 },
        ],
      },
      {
        name: "meeting",
        kind: "dir",
        children: [{ name: "MeetingQueryService.java", kind: "file", lines: 96 }],
      },
      {
        name: "auth",
        kind: "dir",
        children: [{ name: "AuditLogger.java", kind: "file", lines: 64 }],
      },
    ],
  },
  {
    name: "src/main/resources",
    kind: "dir",
    children: [
      {
        name: "mapper",
        kind: "dir",
        children: [{ name: "VoteRecordMapper.xml", kind: "file", status: "modified", lines: 108 }],
      },
      { name: "vote-org-api.yaml", kind: "file" },
    ],
  },
  {
    name: "src/test/java/com/sse/vote/qfii/collect",
    kind: "dir",
    children: [
      {
        name: "DuplicateVoteConcurrencyTest.java",
        kind: "file",
        status: "modified",
        lines: 92,
      },
      { name: "DuplicateVoteCheckerTest.java", kind: "file", lines: 63 },
      { name: "CollectWindowServiceTest.java", kind: "file", lines: 26 },
    ],
  },
  { name: "pom.xml", kind: "file" },
];

/* diffs：key 与上面文件树拼出的路径完全一致（父目录名 + / + 文件名）。
   三个 key 覆盖本次改动的三个层次：裁决逻辑（Java）、加锁读取存量记录所需的
   SQL（mapper）、把裁决固化为判定标准的用例（test）。 */
const diffs: Record<string, DiffLine[]> = {
  /* 根因所在：冲突分支从「直接覆盖」改为「比对 vote_time 取最早，同秒看 accept_seq」。
     晚到通道显式 return 且不写库，避免依赖调用方事务边界（第 1 轮门禁的 warn 项）。 */
  "src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java": [
    { type: "hunk", text: "@@ -52,13 +52,45 @@ public class DuplicateVoteChecker" },
    { type: "ctx", n: 52, text: "    /** 落库一条表决记录；重复表决按「时间优先」以第一次提交为准。 */" },
    { type: "ctx", n: 53, text: "    @Transactional(rollbackFor = Exception.class)" },
    { type: "ctx", n: 54, text: "    public void record(VoteRecord vote) {" },
    { type: "ctx", n: 55, text: "        try {" },
    { type: "ctx", n: 56, text: "            mapper.insert(vote);" },
    { type: "ctx", n: 57, text: "        } catch (DuplicateKeyException e) {" },
    { type: "del", n: 58, text: "            // 唯一约束冲突：同一会议同一实际持有人已存在记录" },
    { type: "del", n: 59, text: "            mapper.updateByMeetingAndHolder(vote); // 直接覆盖存量记录" },
    { type: "del", n: 60, text: "            auditLogger.info(\"重复投票已覆盖 holder={}\", vote.getHolderId());" },
    { type: "del", n: 61, text: "            return;" },
    { type: "add", n: 58, text: "            // 唯一约束冲突只说明存量记录已存在，不能据此覆盖：" },
    { type: "add", n: 59, text: "            // 覆盖等于把「时间优先」实现成了「后写优先」。" },
    { type: "add", n: 60, text: "            VoteRecord kept = mapper.lockByMeetingAndHolder(" },
    { type: "add", n: 61, text: "                    vote.getMeetingId(), vote.getHolderId());" },
    { type: "add", n: 62, text: "            if (kept == null) {" },
    { type: "add", n: 63, text: "                throw new VoteConflictException(\"冲突记录已被并发清理\", e);" },
    { type: "add", n: 64, text: "            }" },
    { type: "add", n: 65, text: "            if (!isEarlier(vote, kept)) {" },
    { type: "add", n: 66, text: "                // 晚到通道：显式不写入，仅落审计，零行更新" },
    { type: "add", n: 67, text: "                auditLogger.discardLateVote(kept, vote);" },
    { type: "add", n: 68, text: "                return;" },
    { type: "add", n: 69, text: "            }" },
    { type: "add", n: 70, text: "            mapper.updateByMeetingAndHolder(vote);" },
    { type: "add", n: 71, text: "            auditLogger.replaceLateVote(kept, vote);" },
    { type: "ctx", n: 72, text: "        }" },
    { type: "ctx", n: 73, text: "    }" },
    { type: "add", n: 74, text: "" },
    { type: "add", n: 75, text: "    /** 时间优先裁决：vote_time 更早者留存。" },
    { type: "add", n: 76, text: "     *  vote_time 为秒级 datetime，同秒两条无法排序，" },
    { type: "add", n: 77, text: "     *  以平台受理序号 accept_seq 较小者兜底。 */" },
    { type: "add", n: 78, text: "    private boolean isEarlier(VoteRecord incoming, VoteRecord kept) {" },
    { type: "add", n: 79, text: "        int cmp = incoming.getVoteTime().compareTo(kept.getVoteTime());" },
    { type: "add", n: 80, text: "        if (cmp != 0) {" },
    { type: "add", n: 81, text: "            return cmp < 0;" },
    { type: "add", n: 82, text: "        }" },
    { type: "add", n: 83, text: "        return incoming.getAcceptSeq() < kept.getAcceptSeq();" },
    { type: "add", n: 84, text: "    }" },
  ],
  /* 裁决需要「读到存量记录」才成立，因此补一条带行锁的按会议 + 实际持有人查询；
     accept_seq 只进入查询列，不改字段类型，也不进入对外报送。 */
  "src/main/resources/mapper/VoteRecordMapper.xml": [
    { type: "hunk", text: "@@ -64,8 +64,20 @@ <mapper namespace=\"com.sse.vote.qfii.collect.VoteRecordMapper\">" },
    { type: "ctx", n: 64, text: "  <resultMap id=\"voteRecord\" type=\"com.sse.vote.qfii.collect.VoteRecord\">" },
    { type: "ctx", n: 65, text: "    <result column=\"meeting_id\" property=\"meetingId\"/>" },
    { type: "ctx", n: 66, text: "    <result column=\"holder_id\" property=\"holderId\"/>" },
    { type: "ctx", n: 67, text: "    <result column=\"vote_time\" property=\"voteTime\"/>" },
    { type: "add", n: 68, text: "    <result column=\"accept_seq\" property=\"acceptSeq\"/>" },
    { type: "add", n: 69, text: "    <result column=\"channel\" property=\"channel\"/>" },
    { type: "ctx", n: 70, text: "  </resultMap>" },
    { type: "ctx", n: 71, text: "" },
    { type: "add", n: 72, text: "  <!-- 冲突分支需要先读到存量记录才能比较 vote_time；" },
    { type: "add", n: 73, text: "       加 FOR UPDATE 防止两个通道同时读到旧值后互相覆盖。 -->" },
    { type: "add", n: 74, text: "  <select id=\"lockByMeetingAndHolder\" resultMap=\"voteRecord\">" },
    { type: "add", n: 75, text: "    SELECT meeting_id, holder_id, vote_time, accept_seq, channel" },
    { type: "add", n: 76, text: "      FROM t_vote_record" },
    { type: "add", n: 77, text: "     WHERE meeting_id = #{meetingId}" },
    { type: "add", n: 78, text: "       AND holder_id = #{holderId}" },
    { type: "add", n: 79, text: "     FOR UPDATE" },
    { type: "add", n: 80, text: "  </select>" },
    { type: "ctx", n: 81, text: "" },
    { type: "ctx", n: 82, text: "  <update id=\"updateByMeetingAndHolder\">" },
    { type: "ctx", n: 83, text: "    UPDATE t_vote_record" },
    { type: "ctx", n: 84, text: "       SET vote_time = #{voteTime}, accept_seq = #{acceptSeq}" },
    { type: "ctx", n: 85, text: "  </update>" },
  ],
  /* 用例是这次修复的验收基线：它先稳定失败（bf3），再在返工后补齐同秒断言（bf12）。
     两条断言分别锁住「留存受理序号较小者」与「晚到提交零行更新」。 */
  "src/test/java/com/sse/vote/qfii/collect/DuplicateVoteConcurrencyTest.java": [
    { type: "hunk", text: "@@ -38,6 +38,32 @@ class DuplicateVoteConcurrencyTest" },
    { type: "ctx", n: 38, text: "    @Test" },
    { type: "ctx", n: 39, text: "    void 早到通道先落库_晚到通道应被丢弃() {" },
    { type: "ctx", n: 40, text: "        submit(\"交易系统\", \"09:31:02\", 100237);" },
    { type: "ctx", n: 41, text: "        submit(\"互联网平台\", \"09:31:05\", 100241);" },
    { type: "del", n: 42, text: "        assertThat(latest().getChannel()).isNotNull();" },
    { type: "del", n: 43, text: "        // 断言过弱：无论留存哪一条都会通过" },
    { type: "add", n: 42, text: "        assertThat(kept().getVoteTime()).isEqualTo(at(\"09:31:02\"));" },
    { type: "add", n: 43, text: "        assertThat(kept().getChannel()).isEqualTo(\"交易系统\");" },
    { type: "ctx", n: 44, text: "    }" },
    { type: "add", n: 45, text: "" },
    { type: "add", n: 46, text: "    /** 同秒提交：vote_time 相等，裁决必须落到 accept_seq。 */" },
    { type: "add", n: 47, text: "    @Test" },
    { type: "add", n: 48, text: "    void 同秒提交_应保留受理序号较小的一条() {" },
    { type: "add", n: 49, text: "        submit(\"交易系统\", \"09:31:02\", 100237);" },
    { type: "add", n: 50, text: "        submit(\"互联网平台\", \"09:31:02\", 100241);" },
    { type: "add", n: 51, text: "        assertThat(kept().getAcceptSeq()).isEqualTo(100237);" },
    { type: "add", n: 52, text: "    }" },
    { type: "add", n: 53, text: "" },
    { type: "add", n: 54, text: "    /** 晚到提交必须是零行更新，而不是「更新成同样的值」。 */" },
    { type: "add", n: 55, text: "    @Test" },
    { type: "add", n: 56, text: "    void 同秒提交_两通道时间戳相同时不得覆盖() {" },
    { type: "add", n: 57, text: "        submit(\"交易系统\", \"09:31:02\", 100237);" },
    { type: "add", n: 58, text: "        int rows = countUpdatesOf(() ->" },
    { type: "add", n: 59, text: "                submit(\"互联网平台\", \"09:31:02\", 100241));" },
    { type: "add", n: 60, text: "        assertThat(rows).isZero();" },
    { type: "add", n: 61, text: "    }" },
    { type: "add", n: 62, text: "" },
    { type: "add", n: 63, text: "    @Test" },
    { type: "add", n: 64, text: "    void 并发十六路提交_留存记录唯一且为最早() throws Exception {" },
    { type: "add", n: 65, text: "        runConcurrently(16, this::submitRandomChannel);" },
    { type: "add", n: 66, text: "        assertThat(rowCount()).isEqualTo(1);" },
    { type: "add", n: 67, text: "        assertThat(kept().getAcceptSeq()).isEqualTo(minAcceptSeq());" },
    { type: "add", n: 68, text: "    }" },
  ],
};

/* 证据链：每条都带出处 / 版本 / 责任人三元组 —— 缺任何一个，结论就退回断言。
   前 5 条已闭环（改动、受控调用、回归、扫描、独立审查），末 2 条刻意未闭环：
   历史脏数据回补方案与合并审批都在人工检查层，AI 只能请求、不能代替。 */
const evidence: EvidenceItem[] = [
  {
    id: "bf-ev-1",
    kind: "change",
    title: "3 个文件变更 · +67 −8（含 1 次定向返工 +18 −4）",
    source: "git.corp/sse/vote_org_qfii",
    version: "fix/duplicate-vote-order@7c41e0d",
    at: "14:06",
    actor: "开发智能体 · dev-2",
    confirmed: true,
    required: true,
  },
  {
    id: "bf-ev-2",
    kind: "toolcall",
    title: "缺陷复现调用 6 次 · 稳定失败 1 例（复现成立）",
    source: "受控连接层审计 · 沙箱 e-inner",
    version: "trc-8f20c5e1 / audit-2026-08-13",
    at: "13:41",
    actor: "受控连接层",
    confirmed: true,
    required: true,
  },
  {
    id: "bf-ev-3",
    kind: "test",
    title: "回归第 1 轮 26 passed / 2 failed（同秒样本未通过）",
    source: "ci.corp/pipeline/9126",
    version: "run#9126",
    at: "14:12",
    actor: "测试智能体 · regression-1",
    confirmed: true,
    required: true,
  },
  {
    id: "bf-ev-4",
    kind: "test",
    title: "回归第 2 轮 31 passed / 0 failed · 分支覆盖 93.8%",
    source: "ci.corp/pipeline/9131",
    version: "run#9131",
    at: "14:29",
    actor: "测试智能体 · regression-1",
    confirmed: true,
    required: true,
  },
  {
    id: "bf-ev-5",
    kind: "scan",
    title: "SAST 无新增阻断项 · 并发与事务规则 12 条全通过",
    source: "scan.corp/sast/2367",
    version: "sast#2367",
    at: "14:31",
    actor: "确定性程序",
    confirmed: true,
    required: true,
  },
  {
    id: "bf-ev-6",
    kind: "review",
    title: "独立审查 4 项建议 · 0 阻断（未覆盖历史数据回补）",
    source: "审查智能体 · review-1（独立于开发智能体）",
    version: "review#512",
    at: "14:34",
    actor: "审查智能体 · review-1",
    confirmed: false,
    required: true,
  },
  {
    id: "bf-ev-7",
    kind: "approval",
    title: "合并请求审批 fix/duplicate-vote-order → main",
    source: "project.corp/approval · MR!318",
    version: "—",
    at: "待放行",
    actor: "项目负责人",
    confirmed: false,
    required: true,
  },
];

/* 任务回放：把「问题定位」从反复追问变成按步查证。
   bf-rp-2 是刻意保留的 fail —— 复现用例稳定失败是修复的前置条件，不是事故；
   bf-rp-7 的回归失败则触发定向返工（回归验证 → 修复实现），只重跑责任节点。 */
const replay: ReplayStep[] = [
  { id: "bf-rp-1", at: "13:36", stage: "任务契约", actor: "责任人", action: "确认改动范围限定冲突分支与完成判定", materials: "contract@bf-v2", tier: "—", result: "ok" },
  { id: "bf-rp-2", at: "13:41", stage: "缺陷复现", actor: "测试智能体", action: "运行并发用例，复现晚到通道覆盖早到记录", materials: "DuplicateVoteConcurrencyTest", tier: "readonly", result: "fail" },
  { id: "bf-rp-3", at: "13:48", stage: "根因定位", actor: "受控连接层", action: "按只读权限检索写入链路与 mapper 定义", materials: "vote_org_qfii@3d90a17", tier: "readonly", result: "ok" },
  { id: "bf-rp-4", at: "13:55", stage: "根因定位", actor: "架构智能体", action: "定位冲突分支未比较 vote_time，秒级精度需序号兜底", materials: "rootcause@v1", tier: "readonly", result: "ok" },
  { id: "bf-rp-5", at: "14:06", stage: "修复实现", actor: "开发智能体", action: "冲突分支改为取最早，晚到丢弃并落审计", materials: "diff@31/6", tier: "write", result: "ok" },
  { id: "bf-rp-6", at: "14:09", stage: "受控调用", actor: "受控连接层", action: "尝试写入生产投票库以核对历史数据", materials: "prod.vote.write", tier: "highrisk", result: "denied" },
  { id: "bf-rp-7", at: "14:12", stage: "回归验证", actor: "确定性程序", action: "回归 2 例失败：同秒未纳入时间优先裁决", materials: "run#9126", tier: "readonly", result: "fail" },
  { id: "bf-rp-8", at: "14:14", stage: "回归验证", actor: "主控智能体", action: "判定为实现问题，定向退回修复实现", materials: "rework#2", tier: "—", result: "ok" },
  { id: "bf-rp-9", at: "14:29", stage: "回归验证", actor: "确定性程序", action: "第 2 轮回归全绿，同秒样本零行更新", materials: "run#9131", tier: "readonly", result: "ok" },
  { id: "bf-rp-10", at: "14:36", stage: "评审交付", actor: "项目负责人", action: "创建合并请求后等待历史数据回补方案", materials: "MR!318 · trc-3a7d91b2", tier: "highrisk", result: "wait" },
];

/* 终端现场：分支 fix/duplicate-vote-order 上的可复算过程 ——
   先看改动面（git status 只有 3 个文件），再看复现失败，最后看返工后的全绿。 */
const terminal: string[] = [
  "agentflow@sandbox  ~/workspace/vote_org_qfii  (fix/duplicate-vote-order)",
  "$ git status --short",
  " M src/main/java/com/sse/vote/qfii/collect/DuplicateVoteChecker.java",
  " M src/main/resources/mapper/VoteRecordMapper.xml",
  " M src/test/java/com/sse/vote/qfii/collect/DuplicateVoteConcurrencyTest.java",
  "",
  "$ mvn -q -Dtest=DuplicateVoteConcurrencyTest test   # 修复前，确认复现成立",
  " [ERROR] 早到通道先落库_晚到通道应被丢弃",
  " [ERROR] expected: <09:31:02 交易系统> but was: <09:31:05 互联网平台>",
  " Tests run: 3, Failures: 1, Errors: 0, Skipped: 0  ·  2.31s",
  "",
  "$ mvn -q compile",
  "✔ BUILD SUCCESS  ·  91 source files  ·  4.4s",
  "",
  "$ mvn clean test -Djacoco.skip=false",
  " DuplicateVoteConcurrencyTest  ·  7 tests, 0 failures  ·  1.21s",
  " DuplicateVoteCheckerTest      ·  15 tests, 0 failures  ·  0.42s",
  " CollectWindowServiceTest      ·  9 tests, 0 failures  ·  0.23s",
  " Tests run: 32, Failures: 0, Errors: 0, Skipped: 1  ·  3.86s",
  " DuplicateVoteChecker.java  行 97.1% | 分支 93.8% | 方法 100%（jacoco）",
  "",
  "$ git log --oneline -2",
  " 7c41e0d fix(collect): 同秒提交以 accept_seq 兜底，晚到提交零行更新",
  " 9b2f5aa fix(collect): 唯一约束冲突后比对 vote_time 取最早一条",
  "",
];

/** 缺陷修复（wf-bugfix）的检查面板现场 */
export const bugfixBundle: InspectorBundle = {
  files,
  diffs,
  evidence,
  replay,
  terminal,
};
