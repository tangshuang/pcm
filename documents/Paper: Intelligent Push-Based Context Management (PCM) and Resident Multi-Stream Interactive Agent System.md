# Intelligent Push-Based Context Management (PCM) and Resident Multi-Stream Interactive Agent System

## Abstract

Large language model (LLM)-driven conversational systems frequently encounter constraints in context windows, irreversible loss of details due to historical compression, increased latency and costs from input expansion, and difficulties in supporting parallel collaboration and real-time interruption in "linear Q&A" interaction modes. This paper proposes an intelligent push-based context management (Push-based Context Management, PCM) architecture and multi-stream interactive Agent oriented towards resident services: the system uniformly models user inputs and environmental changes as event streams, performs intent recognition and Context Plan generation in continuous services, and constructs high-precision contexts under budget constraints through parallel retrieval and structured assembly, submitting them to LLM for execution or response. Furthermore, the paper emphasizes that the operational definition of "lossless memory" should be decomposed into "lossless storage" and "controllable retrieval", and provides engineering methods for achieving "controllable precision": confidence-driven intent control plane, mixed recall and unified reranking retrieval layer, context compiler with budget and conflict resolution, and iterative evaluation and feedback loops. Finally, the paper provides reproducible module boundaries and data architecture, and discusses the risks of stability, cost, and consistency when relying solely on LLM for intent recognition and topic mining, proposing incremental, normalized, and auditable systematic improvement paths.

**Keywords:** Context Engineering; Intent Recognition; Multi-Source Retrieval; Resident Services; Interruption Handling; Environmental Awareness; Context Planning; Observable Agents; Dual Database

---

## 1. Introduction

### 1.1 Problem Motivation

Mainstream conversational systems typically follow a "user asks—model responds" linear flow: user input is appended to the message list, and when the window approaches its limit, part of the history is retained through sliding windows or summary compression, then the "compressed history + current input" is submitted to the LLM. This path has two fundamental contradictions:

1. **Conflict between detail fidelity and budget constraints**: Compression inevitably loses details; not compressing leads to uncontrollable tokens, latency, and costs.

2. **Mismatch between linear interaction and real dialogue**: Human dialogue can be interrupted at any time, can proceed in parallel and converge when needed; linear mode usually leads to users having to interrupt execution to supplement information, thereby reducing dialogue continuity.

Based on the following problem setting: If the system can construct "sufficiently precise task-state context" before submitting to LLM, and this context can answer a set of minimal yet sufficient task-related questions (such as: who is the user (preferences/permissions/intangibles), what is the big picture (long-term goals/project context), what is the current progress (completed/ongoing/blocked points), what is the current goal (what does the user want the system to do now, and acceptance criteria), what reference materials (available evidence boundaries), what tools are available (action space and constraints)), then there is no need to inject the full dialogue history to significantly improve execution quality. This paper, based on this setting, gives a systematic definition of PCM, controllable analysis, and engineering implementation plan.

### 1.2 Contributions

The main contributions of this paper are:

- Propose and formalize PCM: replace linear history accumulation and compression with intent-driven context planning under budget constraints.

- Propose an algorithmic model for user intent recognition and Context Plan generation: multi-signal inference, confidence calibration, and degradable control plane.

- Give an operational definition of "lossless memory": distinguish "lossless storage" and "controllable retrieval", and propose an evaluation system for key fact recall and false recall control.

- Provide system decomposition for achieving "controllable precision": control plane (Context Plan), data plane (retrieval and reranking), compiler (context assembly), feedback loop (evaluation and learning).

- Summarize reproducible architecture: resident service, concurrent queue, multi-stream interruption, environmental awareness, spatialized canvas, dual database.

- Discuss risks of relying solely on LLM for intent recognition and topic mining in stability, cost, and consistency, and propose confidence, incremental, and normalized improvement paths.

---

## 2. Concepts and System Model

### 2.1 Event Stream Perspective: Unified Modeling of User Input and Environmental Changes

The system uniformly models inputs as event streams \( \mathcal{E} = \{e_t\} \), where event sources include:

- User instruction events: input text, branching parent nodes, sessions and user identifiers, etc.

- Environmental events: file changes, feed updates, API numerical changes, etc.

The system maintains state \( S_t = (S_u, S_s, S_e) \) in resident service, representing user profiles and preferences, session structure and task progress, and environmental event buffers respectively. The system output is comprehensive feedback to states and events, not isolated responses to single inputs.

### 2.2 "Minimal Task-State Context Contract" (MTSCC)

MTSCC describes "context sufficiency" as the ability to answer the following questions:

- Who is the user (preferences/permissions/untouchables)

- What is the big picture (long-term goals/project context)

- What is the current progress (completed/ongoing/blocked points)

- What is the current goal (what the user wants the system to do now, and acceptance criteria)

- What reference materials (available evidence boundaries)

- What tools are available (action space and constraints)

The paper further emphasizes: To make context go from "informationally complete" to "controllable", the contract needs to add three categories of fields:

- **Success criteria**: What counts as completion (verifiable deliverables/checkpoints).

- **Prohibitions and permission boundaries**: What must never be done/what must not be assumed.

- **Uncertainties**: Missing information must be clarified by the user, not freely filled in by the model.

---

## 3. Method: Intelligent Push-Based Context Management (PCM)

### 3.1 Problem Definition

Given user input \( u_t \), user state \( S_u \), session state \( S_s \), environmental state \( S_e \), external memory library \( M \), target is to build context \( C_t \) within budget \( B \) (token/latency/tool call limits) to maximize task success probability:

\[
C_t = \operatorname{Build}(u_t, S_u, S_s, S_e, M; B)
\]

The key to PCM lies in introducing Context Plan as the control plane:

\[
P_t = \operatorname{Plan}(u_t, S_u, S_s, S_e)
\]

Where \( P_t \) determines: retrieval sources, time windows, recall scales, reranking strategies, budget allocations, whether to allow interruption, and degradation paths when confidence is insufficient.

### 3.2 Differences from Traditional Linear Dialogue

```mermaid
User input → History accumulation/compression → messages[] → LLM → Output
```
*Figure 1 Traditional linear dialogue context construction flow.*

```mermaid
Event (user/environment)
  → Intent and plan (Plan)
  → Multi-source parallel recall (Retrieve)
  → Unified reranking and deduplication (Rerank/Dedup)
  → Context compilation (Compose under Budget)
  → messages[] → LLM → Output/Action
```
*Figure 2 PCM (plan-driven, push assembly) context construction flow.*

### 3.3 Operational Definition of "Lossless Memory"

"Lossless memory" understood as "each context prompt fully reproduces all history" is not feasible or necessary under budget constraints. This paper decomposes it into:

- **Lossless Storage**: The system does not discard original dialogue and key events, allowing retrospective and reconstruction. Implemented by appending-style message/event logging to preserve original streams, and structured storage to maintain queryable metadata for tasks, intents, and sessions, thereby supporting replay and audit.

- **Controllable Retrieval**: Within given budget, high probability recall of key facts while controlling false recalls, and failures are diagnosable and fixable.

Therefore, "lossless" evaluation should be based on task-related key facts, not token-level historical reproduction. Corresponding metrics see Section 8.

### 3.4 User Intent Recognition and Context Plan Generation: Controllable Algorithmic Model

User intent directly determines PCM's information triage and budget allocation, so intent recognition in this framework is not "outputting a label from a classifier", but a structured inference and generation problem oriented towards the control plane: from input event streams and system states, infer an auditable, calibratable, and degradable Context Plan to constrain subsequent retrieval, compilation, and actions.

#### 3.4.1 Formalization: From Intent Classification to Plan Inference

Let \( e_t \) represent the external event at time \( t \) (user input or environmental change), \( S_t = (S_u, S_s, S_e) \) the system state. Intent inference and plan generation can be viewed as solving a constrained posterior distribution and decision function:

\[
p(z_t | e_t, S_t), \quad P_t = f(e_t, S_t, z_t)
\]

Where \( z_t \) is the potential intent variable, containing task type, goal structure, constraints and risk level, etc.; \( P_t \) is the executable Context Plan. Different from traditional "intent = single label", \( P_t \) must explicitly output control variables (Table 3), to ensure the context building process is replayable, interpretable, and comparable.

#### 3.4.2 Multi-Signal Fusion: Robust Intent Inference from Evidence Perspective

In resident systems, single-turn text signals are insufficient for stable control. This paper adopts a "multi-signal evidence fusion" view, dividing available information into four categories of evidence and performing joint inference:

*Table 1 Multi-signal evidence*

| Evidence Category | Representative Inputs | Main Contributions | Typical Failure Modes |
| --- | --- | --- | --- |
| Text semantic evidence | Current input text, keywords, instruction patterns | Provide explicit goals and operation clues | Instruction omission, implicit goals, ambiguous expressions |
| Interaction structure evidence | Parent-child branches, recent messages, task state machine position | Constrain "current progress/context" | Improper flow merging due to state confusion in parallel streams |
| User profile evidence | Preferences, permission boundaries, disabled items, common tools | Limit available action space | Cold start or profile drift |
| Environmental evidence | Recent environmental events, feed updates, external system states | Provide triggering and constraint conditions | High-frequency noise events interfering |

The goal of joint inference is: when evidence is insufficient, explicitly increase uncertainty rather than force determination; when evidence conflicts, trigger conflict exposure or clarification strategies (Sections 6.3, 8.2).

#### 3.4.3 Hierarchical Intent Structure: Control Plane-Oriented Intent Space Design

To make intent directly drive information triage, this paper designs the intent space as a hierarchical structure, not a flat label set. A feasible hierarchical structure is:

\[
z_t = (\text{Mode}, \text{TaskType}, \text{Goal}, \text{Constraints}, \text{Risk})
\]

- Mode: Q&A, task execution, interruption, active push, etc. interaction modes.

- TaskType: For example, retrieval-type, generation-type, change-type (write/modify code or documents), diagnostic-type, planning-type, etc.

- Goal: Structurable goals and acceptance (aligned with MTSCC).

- Constraints: Prohibitions, permission boundaries, evidence boundaries, tool boundaries and budget boundaries.

- Risk: Characterization of error costs (influencing degradation and clarification intensity).

The role of this hierarchical structure is to align "semantic understanding" with "control decisions": Plan's budget allocation, retrieval channel selection, and compilation strategies can be directly parameterized by \( z_t \)'s dimensions, thereby avoiding uncontrollable fluctuations due to implicit prompts.

#### 3.4.4 Context Plan Generation: Constrained Generation and Consistency Validation

In algorithmic implementation, Context Plan can be viewed as a structured object with constraints. Its generation process includes two stages:

1. Candidate generation: Generate several candidate Plans based on current evidence, covering different recall intensities and clarification strengths (embodying "coverage-precision" trade-off).

2. Consistency validation and pruning: Apply hard constraints and consistency rules to candidates, such as permission boundaries, prohibitions, budget limits, tool availability, and state machine reachability; execute removal or repair for those not meeting hard constraints.

The significance of this mechanism lies in: transforming Plan generation from "language model output" to "constraint-driven decision object", and explicitly making unverifiable system constraints verifiable conditions, thereby improving control plane determinism and safety.

#### 3.4.5 Confidence Calibration and Degradable Strategies: Avoiding Cascading Amplification of Incorrect Control Plane

Intent recognition errors cascade and amplify in PCM (wrong retrieval sources, wrong time windows, wrong budgets), so control plane outputs must be calibrated for confidence and designed for rejection/degradation. This paper adopts three categories of mechanisms:

- Confidence decomposition: Separately assess confidence in Mode, TaskType, and Goal/Constraints sufficiency, avoiding single confidence masking local uncertainties.

- Uncertainty triggering: When key fields (such as acceptance, prohibitions, evidence boundaries) are missing or conflicting, prioritize clarification rather than default filling.

- Cost-controlled degradation: Low confidence expands recall and enhances reranking and conflict exposure, while tightening action-type outputs (such as writing, deleting, external calls) until sufficient evidence is obtained.

This strategy is consistent with the control plane principles in Section 6.1: intent is not the only control plane, Context Plan is; confidence is a core control variable of the Plan.

#### 3.4.6 Online Learning and Evaluation Loop: From Intent Quality to Task Quality Measurable Mapping

The goal of intent recognition is not "classification accuracy" itself, but comprehensive optimization of task success rates, costs, and delays. For this, this paper suggests using Section 8 metrics as upper-level objectives, mapping intent and Plan quality assessments to observable results:

- Intent-Plan consistency: Whether the Plan meets MTSCC's key field requirements (goals, acceptance, constraints, and tool boundaries).

- Decision reproducibility: Stability and replayability of Plans under the same state snapshots.

- Control plane benefits: Marginal contributions of Plan strategies to key fact recall, false recall, conflict exposure, and cost/delay under the same task distribution.

Under this loop, the intent model is embedded as an optimizable control system component, with its improvements subject to empirical indicators of "task quality and resource efficiency", rather than stopping at semantic label levels.

### 3.5 Intent-Driven Branch Continuation and Canvas-Memory Integrated Data Structure

In supporting task branch networks interaction modes, "previous node" should not be explicitly selected by the user or approximated by the latest node in time order. The system must model "which task branch the input should continue to" as part of intent inference, and explicitly inject this decision result into Context Plan, making context compilation have a definite anchor and replayable branching semantics.

#### 3.5.1 Task Branch Network and Anchor Selection Problem

Let the interactions and task organization in the session be a directed graph \( G = (V, E) \). Where \( V \) can contain turn nodes (turn), task nodes (task), environmental event nodes (env), memory nodes (memory), and artifact nodes (artifact); edges \( E \) describe continuation, reference, and derivation, etc. For any new input event \( e_t \), the system needs to output a context anchor \( a_t \in V \) or output the judgment of "creating new task root":

\[
a_t =
\begin{cases}
\arg\max_{v \in A_t} \ \mathrm{score}(e_t, v; S_t), & \max_{v \in A_t}\mathrm{score} \ge \tau_{new} \\
\varnothing, & \text{otherwise}
\end{cases}
\]

Where candidate set \( A_t \) is usually "active task branch frontiers + recent several turn nodes + environment-triggered related nodes"; \( \tau_{new} \) is the new task judgment threshold. Anchor \( a_t \) determines the structural boundary of context compilation: which historical chains are main context, which cross-branch information can be supplementary retrieval.

#### 3.5.2 Scoring Function: Multi-Signal Fusion and Explicit Uncertainty

\( \mathrm{score}(e_t, v; S_t) \) is not a single similarity, but should comprehensively semantic consistency, task state consistency, and interaction structure consistency. A feasible decomposition is:

\[
\mathrm{score} = \lambda_1 \cdot \mathrm{sim}_{sem}(u_t, v) + \lambda_2 \cdot \mathrm{sim}_{task}(z_t, v) + \lambda_3 \cdot \mathrm{recency}(v) + \lambda_4 \cdot \mathrm{focus}(v) - \lambda_5 \cdot \mathrm{conflict}(v)
\]

Where \( \mathrm{sim}_{sem} \) can be approximated by vector similarity or keyword matching, \( \mathrm{sim}_{task} \) reflects the matching degree of input intent structure (Section 3.4.3) with task node constraints, \( \mathrm{focus} \) reflects the current "branch focus state" of the session, \( \mathrm{conflict} \) penalizes known conflicts or permission boundary violations. The system should explicitly assess top-1 and top-2 score differences, key constraint absences, and evidence conflicts; when uncertainty exceeds threshold, prioritize clarification or adopt conservative Plan degradation.

#### 3.5.3 Canvas-Memory Integration: Turn Nodes as Minimal Traceable Units

To avoid "input and intent separation" leading to context misalignment, the system uses turn nodes as minimal traceable interaction units, bundling user inputs with intent/Plan structured results for storage and display. This design enables:

- Replayable interactions: Any one context compilation can be traced back to the corresponding turn node and its Plan.

- Switchable branches: The decision to continue input to branches is in the form of anchor selection in the Plan, rather than implicit dependence on UI selection.

- Retrievable memory: All memories exist as graph nodes, retrievable through graph traversal (getting main context along continuation chains), or through multi-channel retrieval to recall cross-branch evidence, then unified pruning and referencing by the compiler under budget constraints.

```mermaid
flowchart LR
  U[User input u_t] --> I[Intent inference z_t]
  I --> P[Context Plan P_t]
  P --> R[Anchor routing a_t selection/new task judgment]

  subgraph G[Session task graph G]
    direction LR
    T1[Task branch 1] --> N1[Frontier node v1]
    T2[Task branch 2] --> N2[Frontier node v2]
    T3[Task branch 3] --> N3[Frontier node v3]
  end

  G --> R
  R --> A[Determine main context chain (retrospective along continues)]
  A --> C[Context compilation C_t]
  C --> L[LLM output/action]
```
*Figure 3 Intent-driven branch continuation illustration: input events generate anchor selection through intent inference, then determine the previous node and main context chain for context compilation; parallel task branches can coexist in the same session graph.*

#### 3.6 Engineering Implementation of Structured Intent and Context Requirement Specification (CRS)

In PCM, intent is not the final control plane; the truly controllable is "context requirement specification" (Context Requirement Spec, CRS). To make the control plane interpretable and replayable, the prototype system extends intent output from single label to structured intent graph, and explicitly generates CRS as the a priori constraint for context compilation.

##### 3.6.1 Structured Intent Graph: From "Labels" to "Evidence-Based Achievable Goals"

We represent intent as a three-layer structure: interaction mode, semantic topic, and control-plane-oriented structured fields. Denote \( I_t \) as the intent object at time \( t \), which can be formalized as:

\[
I_t = \{ \text{intent}, \text{topic}, \text{urgency}, \text{confidence}, \text{intentStruct} \}
\]

Where `intentStruct` contains goals, constraints, entities, plan hints, and evidence snippets. This structure directly supports evidence tracking and uncertainty exposure:

```json
{
  "goal": "Core goal",
  "constraints": ["Constraint conditions"],
  "entities": ["Key entities"],
  "planHints": ["Plan hints"],
  "evidence": [{"source": "user_input", "span": "Evidence snippet"}],
  "uncertaintyReasons": ["Uncertainty reasons"]
}
```

In engineering implementation, the system requires LLM to return strict JSON, and performs normalization and default supplementation in the intent engine to avoid structural drift leading to control plane instability.

##### 3.6.2 CRS: Intent-Driven Context Requirement Synthesis

CRS is defined as the combination function of intent structure and context prompts:

\[
\text{CRS}_t = g(I_t, H_t, B)
\]

Where \( H_t \) is the context prompt (e.g., whether to include recent history, memory types, time windows), \( B \) is the budget constraint. CRS's key fields include: necessary information collection (required), constraint collection (constraints), history policy (historyPolicy), budget (budget), and retrieval scoring weights (scoring). Its role is to transform "what to retrieve, how to crop, budget allocation" from implicit prompts to explicit control parameters.

Example (simplified):

```json
{
  "required": ["recent_history", "task_state"],
  "constraints": ["no_pii"],
  "historyPolicy": {"window": "last_5_turns"},
  "budget": {"tokens": 2000, "toolCalls": 2},
  "scoring": {"lambda_sem": 0.4, "lambda_task": 0.3},
  "toolPolicy": {"allowedTools": ["search", "db_query"], "blockedTools": ["payment"]}
}
```

##### 3.6.3 Prototype Implementation and Observability Design

To make structured intent and CRS observable by the system and frontend, the prototype implementation adopts the following engineering strategies:

1. **Structured intent output and confidence calibration**: LLM outputs `intentStruct` and `confidence`, intent engine uniformly normalizes fields and supplements defaults.

2. **CRS generation**: Context builder provides `buildSpec` to generate CRS, as explicit input for context compilation.

3. **Dual storage strategy**: SQLite saves intent basic fields and confidence; LevelDB saves `intentmeta:{intentId}` and `ctxspec:{intentId}`, to ensure structured information is traceable and replayable.

4. **Interface and frontend alignment**: Provide `/api/intents/:intentId/meta` and `/api/intents/:intentId/spec` endpoints, frontend loads and displays structured intent and CRS on demand in the intent panel, thereby achieving "observable intent—observable context" loop.

This implementation makes the key intermediate states of the "intent—plan—compilation" chain explicit, providing data basis for subsequent evaluation, diagnosis, and online optimization.

##### 3.6.4 Intent-based filtering of tools and Skills: control-plane-driven tool filtering

At the tool-calling layer, a common industry path is to inject the full tool list or its summaries into the LLM for selection, which incurs significant token cost and latency. Even with Skills' "progressive disclosure" mechanism, tool list growth still faces expansion issues. PCM treats tool and Skills selection as a control-plane problem: first apply coarse filtering on the tool list based on intent and CRS, removing obviously irrelevant tools, and only pass the "relevant subset" to the LLM for final precise selection. This is equivalent to "tool-level context compilation", allowing a theoretically unbounded tool/Skills registry while ensuring each model decision carries only the minimal set relevant to the current task. As a result, tool selection token overhead is reduced and invocation performance improves without sacrificing extensibility.

---

## 4. Architecture: Resident Multi-Stream Interactive Agent

### 4.1 Resident Service and Concurrent Queue: From Linear Q&A to Multi-Stream Dialogue

The system can maintain a bounded concurrent scheduling queue (maximum concurrency \( k \)) for each WebSocket client connection, elevating message processing from "single-chain serial" to "multi-stream non-blocking". Its significance lies not only in performance optimization, but also in supporting a more interaction paradigm that better matches human dialogue features:

```mermaid
flowchart LR
  E[Input event stream] --> Q[Pending queue Q]
  Q --> F[Tool filtering<br/>(intent/CRS)]
  F --> W1[worker 1<br/>Parse/retrieve/tools/generate]
  F --> W2[worker 2<br/>Parse/retrieve/tools/generate]
  F --> Wk[worker k<br/>Parse/retrieve/tools/generate]
  W1 --> O[Multi-stream output]
  W2 --> O
  Wk --> O
```
*Figure 4 Conceptual illustration of bounded concurrent scheduling with tool filtering (single client perspective).*

- Traditional chatbot: User asks, system responds; if tool calls, usually forms "call—wait—reply" single chain; user supplements usually mean interrupting the chain.

- Multi-stream dialogue: Users can continue input supplements, questions, or new instructions during system execution; the system can analyze and respond in parallel, and merge back into the same conversation context when needed.

In this paradigm, user input and environmental changes are both "external instruction streams", system output is comprehensive feedback to "environmental state + instruction state", not isolated responses to single inputs.

At the tool layer, PCM control plane still performs tool filtering: intent/CRS → filtered tool list → LLM selection → tool invocation, maintaining low-cost tool decisions within concurrent workers.

### 4.2 Multi-Channel Response: Q&A, Tasks, and Interruptions

The system divides inputs into three path types:

- Ordinary Q&A: Build context and directly stream response.

- Task execution: Create task record, build context, stream output, and update task status.

- Interruption response: When intent is interrupt, the system queries current running tasks and builds interruption context, using independent stream to answer user questions, without necessarily terminating the original task.

### 4.3 Environmental Awareness

Environmental awareness writes external changes to environmental event streams through sensors and broadcasts to clients, supporting real-time context updates and proactive prompts. Can include:

- File change monitoring

- RSS/web feed

- API polling and differential triggering

---

## 5. Prototype Implementation: Module Boundaries and Data Architecture

### 5.1 Core Modules

- Intent Recognition: Output structured intent and context planning candidate parameters (e.g., task types, urgency, confidence, constraints).

- Context Building: Parallel retrieve multi-source information, assemble candidate collections and perform deduplication and reranking, form context drafts.

- Task Orchestration: Maintain task lifecycle and state machine, schedule tool calls, long tasks, and merge strategies for concurrent inputs.

- LLM Adaptation: Provide unified model calling interfaces and strategies (model selection, temperature/format constraints, streaming output, etc.).

### 5.2 Dual Database Architecture: Structured Metadata and Unstructured Content Separation

Can adopt "structured metadata + unstructured content logging" dual combination:

*Table 2 Database choices*

| Storage Type | Main Objects | Access Patterns | Typical Roles |
| --- | --- | --- | --- |
| Structured storage (relational/columnar) | User, session, task, intent, subscription, environmental event metadata | Filter, aggregate, join, audit queries | Traceable and observable state management |
| Unstructured storage (KV/logging/object storage) | Message originals, memory fragments, context snapshots, vector embeddings, canvas graphs, etc. | Append write, key read, bulk scan/index | Lossless storage and retrieval candidate pools |

This design significance lies in: Decoupling "traceable (Lossless Storage)" and "queryable (Structured Retrieval)" to reduce read-write conflicts and reserve interfaces for future multi-level indexing and reranking models.

---

## 6. Controllable Precision: From "Available" to "Auditable, Measurable, Iterable"

This paper points out that the difficulty of PCM lies not in "whether to retrieve and assemble prompts context", but in making this construction a controllable system: stable output, diagnosable failures, predictable costs, optimizable effects. For this, this paper decomposes the system into four subsystems and gives respective control variables and observation metrics.

### 6.1 Control Plane: Intent is not the only control plane, Plan is

In the above prototype implementation, intent analysis can be directly generated by LLM with structured fields, and further extended to "context building prompts" (e.g., whether to include recent history, whether to need environmental state, preferred memory types and time windows), used to guide subsequent retrieval and assembly.

*Table 3 Suggested auditable fields for Context Plan (example).*

| Field Family | Representative Fields | Main Roles | Controllability Benefits |
| --- | --- | --- | --- |
| Intent and confidence | Task type, urgency, confidence, whether need clarification | Describe "what to do" and "how certain" | Trigger degradation, clarification, conservative strategies, reduce risk of execution based on insufficient information |
| Retrieval strategy | Data source selection, time window, recall scale, recall channels | Describe "where to get information" | Make recall coverage and cost predictable, replayable |
| Reranking and cropping | topK, deduplication thresholds, diversity constraints, evidence priorities | Describe "how to pick and compress" | Make precision/redundancy/bias explicit optimizable variables |
| Budget and delay | Token quotas, tool call limits, timeout strategies | Describe "resource boundaries" | Include cost and delay in control plane, facilitate strategy comparison |
| Concurrency and interruption | Allow concurrency, allow interruption, merge rules | Describe "interaction semantics" | Support non-linear interactions while maintaining state consistency |

From a controllability perspective, single LLM intent output should not become the "only control plane", reasons include:

- **Output jitter**: Same sentence may produce different classifications under different contexts/temperatures.

- **Cascading amplification**: Intent errors lead to overall deviation in data source selection, time windows, budget allocation.

Therefore, a more robust approach is: Output an auditable **Context Plan**, and degrade based on confidence:

- High confidence: Execute more aggressive cropping and stricter budget allocation.

- Low confidence: Expand recall, increase reranking, or trigger clarification requests, avoid execution based on insufficient information.

### 6.2 Data Plane: Mixed Recall + Unified Reranking

The prototype includes two recall signals:

- Structured filtering: Filter by memory types, time windows, task associations, etc. metadata.

- Semantic recall: Similarity retrieval based on vector embeddings (e.g., cosine similarity).

To achieve "controllable precision", suggest organizing retrieval in three-stage pipeline:

1. Multi-channel recall: Parallel recall of keywords/structured/vector/topic indexes/graph relations, etc.

2. Unified reranking: Unified score candidates and select topK.

3. Deduplication and diversity control: Avoid candidate high homogeneity leading to information redundancy.

The value of this pipeline lies in: Recall stage pursues coverage, reranking stage pursues precision, thus decomposing "precision" into optimizable sub-goals.

### 6.3 Context Compiler: Budget Allocation, Conflict Resolution, and Referenceable Evidence

A implementation can first complete "parallel retrieval + assembly" basic capabilities, "context compiler" should have:

- Budgeter: Allocate token and entry quotas to different semantic segments from global budget.

- Conflict resolver: When same fact has multiple versions, select or explicitly mark conflicts based on source, time, and confidence.

- Evidence reference: Bind key facts to source identifiers (messages/memories/events), for diagnosis and audit.

### 6.4 Feedback Loop: Evaluation and Learning Loop

No evaluation loop context system cannot converge from failures. The loop needs:

- Record each build's Plan, candidate collection, final context, and task results.

- Offline replay evaluation: Reproducibly compare different context strategies in quality, cost, delay, and anchor selection correctness.

- Online shadow: In real traffic, simultaneously run PCM and control system, but only display PCM output, control output for offline evaluation and replay analysis, thereby reducing user experience risk and obtaining real-distribution evidence.

---

## 7. Topic Indexing: Consistency and Cost Control (From Conception to Deployable System)

The basic concept of topic indexing is: Backend service mines topics and establishes "topic—content" mappings, online matches input and topics to recall related content based on. From engineering perspective, this direction is feasible in principle; however, if completely dependent on LLM for topic extraction, uncontrollable risks will appear in two aspects:

- Cost: Periodic full extraction will present unacceptable call volumes after user scale growth.

- Consistency: Topic naming, granularity, and synonym merging drift, leading to index expansion and unusability.

Therefore, topic indexing to become a deployable system needs at least three mechanisms:

- **Incremental triggering**: Trigger by new content batches, rather than timed full scans.

- **Normalization and merging (Canonicalization)**: Merge synonyms, near-synonyms, cross-language, and case-sensitivity into canonical topics; maintain version evolution.

- **Auditable relation graph**: Relation establishment should have interpretable evidence (co-occurrence statistics, threshold rules, or LLM generation then validation), avoid "hallucination relations" polluting indexes.

In this paper's framework, topic indexing is one recall channel of the retrieval layer, subject to Context Plan and budgeter constraints, not unbounded expansion background accumulation.

---

## 8. Evaluation: Metric System, Experimental Protocols, and Reproducibility

### 8.1 "Lossless Storage" Metrics

- Dialogue replay completeness: Whether specified session can be fully reconstructed (messages, edit histories, intents, tasks, events).

- Trace chain completeness: Message identifier → intent identifier → response identifier consistency checkable (reflecting cross-storage association and audit capabilities).

### 8.2 "Controllable Retrieval" Metrics (Key Facts)

- Key Fact Recall Rate: For given task annotated key constraint collection, statistics whether included in context.

- False Context Rate: Proportion of irrelevant or contradictory facts in context.

- Conflict Exposure Rate: When conflicts exist, whether system explicitly prompts conflicts rather than implicit selection.

### 8.3 Cost and Delay Metrics

- Build P50/P95: Context build delay percentiles.

- First token delay: Delay from user input to streaming first segment output.

- Token efficiency: Average token consumption under same success rate.

### 8.4 Multi-Stream Interaction Metrics

- Interruption robustness: Correct answer rate of interruption questions, and success rate of original task continuation after interruption.

- Parallel dialogue consistency: Whether state updates caused by parallel inputs are consistent (e.g., task status, parent-child chains).

### 8.5 Experimental Protocols: Offline Replay, Online Shadow, and Ablation

To position PCM's benefits as "strategy gains" rather than "model differences", experiments must satisfy: same model, same decoding parameters, same prompt templates (only replace context construction strategies), and unify output scoring. Experiment flow is divided into three categories:

- Offline Replay: Based on fixed datasets replay dialogues and environmental events, reproducibly compare different context strategies in quality, cost, delay, and anchor selection correctness.

- Shadow Mode: In real traffic, simultaneously run PCM and control system, but only display PCM output, control output for offline evaluation and replay analysis, thereby reducing user experience risk and obtaining real-distribution evidence.

- Ablation Experiments: In PCM internals, sequentially close key mechanisms (anchor routing, evidence boundaries, progress extraction, structured templates, environmental event channels, etc.), used to answer "gains from where".

### 8.6 Control Systems and Ablation Settings

At least include three control systems to separate "shorter context" and "better orchestration" contributions:

- B1 Full History: Include all history by time order, and adopt fixed truncation rules (if exceed budget).

- B2 Naive Truncation: Only take most recent N turns or fixed token windows, no retrieval and structuring.

- B3 Conventional RAG: Based on vector retrieval from history and knowledge base take Top-K fragments direct splicing, no explicit modeling Context Plan, evidence boundaries, and progress states.

Ablation settings with "close single mechanism, keep others unchanged" principle, e.g., close anchor routing (fixed connect to end node), close evidence boundaries (allow reference all materials), close progress extraction (only use recent dialogues), close structured templates (change to direct splicing fragments), etc.

### 8.7 Datasets and Scenario Matrix

Evaluation data adopts three-layer strategy, simultaneously satisfying comparability, coverage, and realism:

- Standard benchmarks: Select public long-context/long-dialogue benchmarks, unify rewrite as "dialogue—evidence—constraints" format for external comparable quality and robustness measurement.

- Structured synthesis: Generate samples covering long-term constraints and branch continuation based on scenario matrix, ensure containing preferences/permissions, evidence boundaries, progress updates, evidence version conflicts, multi-task parallelism, and anchor branch selection, etc. key difficult cases.

- Real log replay: Sample from real sessions and desensitize, retain canvas structure and system traces (Plan, anchor, candidate collections, context snapshots), used to verify product distribution actual benefits.

### 8.8 Statistical Methods and Significance Analysis

Evaluation must simultaneously report average effects and uncertainties, avoid "single sample narrative" causing biases:

- Stratified summarization: Stratify by scenario types, task types, and length intervals, report means and percentiles (e.g., P50/P90) separately.

- Significance testing: For key metrics adopt paired designs (same input under different strategies output comparison), report confidence intervals and effect sizes; when distributions deviate from normal, use non-parametric tests.

- Evaluation consistency: Introduce calibration sets and manual spot checks for LLM-as-a-judge automatic scoring, estimate biases and report consistency measures.

### 8.9 Reproducibility: Record, Replay, and Audit

Reproducibility depends on "recording replayable control plane and data plane decisions". Each run records: inputs (timestamps, session/task identifiers), intents and Context Plans, anchor candidates and scorings, recall candidates collection, cropping and reranking results, final context snapshots, models and parameters, tool calls and errors. Offline replay supports replaying Plan and context building processes under same state snapshots, thereby making failures locatable, changes comparable.

### 8.10 Threats to Validity

- LLM-as-a-judge evaluation bias: Automatic evaluation may be sensitive to expression styles.

- Task distribution bias: Training/evaluation task types not covering real production distributions.

- Environmental event noise: High-frequency environmental events may introduce irrelevant contexts, need budget and filtering.

- Vector linear scan non-scalable: Prototype completes similarity sorting with linear scans, after scale increases, need replace with approximate nearest neighbor (ANN) indexes.

---

## 9. Complete System Design: PCM and Resident Multi-Stream Interactive Agent

This section organizes the previous methods and architectural elements into a deployable, auditable complete system design. The system takes event streams as unified inputs, takes Context Plan as control plane, completes multi-source retrieval, unified reranking, context compilation under budget constraints, and multi-stream outputs, with observable data loops supporting iterative optimization.

### 9.1 Interaction Semantics and Runtime: Resident Service, Multi-Stream Concurrency, and Interruptible Merging

The system adopts resident service morphology, maintains bounded concurrency for each client to support multi-stream dialogue. Its interaction semantics characterized by three principles:

- Concurrency reachability: Allow parallel processing of multiple input streams within same session, forming Q&A, task, and interruption response outputs respectively.

- Interruption consistency: Interruption inputs give immediate replies with independent output streams, while maintaining original task execution semantics and state machine consistency, not equating interruption to termination.

- Merging controllability: Parallel streams can merge in session layer by parent-child relationships or explicit strategies, avoid state overrides and causal confusion, provide deterministic order for subsequent reproducible replay.

### 9.2 Control Plane: Explicitization and Confidence-Driven Degradation Strategies of Context Plan

The system decouples "intent recognition output" and "context building control variables", adopts auditable Context Plan as unique control plane carrier. Context Plan consists of intent and confidence, retrieval strategies, reranking and cropping, budget and delay, concurrency and interruption, etc. field families (see Table 3), satisfies two requirements:

- Replayable: Same input under given state snapshot generated Plan recordable and replayable, making context building process reproducible.

- Degradable: When confidence insufficient or evidence insufficient, system degrades with clarification requests, expanded recall, and more conservative budget allocations, avoid execution based on insufficient information.

### 9.3 Data Plane: Multi-Channel Recall, Unified Reranking, and Auditable Topic Indexing Channels

The system organizes retrieval layer with "coverage-prioritized multi-channel recall + precision-prioritized unified reranking". Multi-channel recall can include structured filtering, vector similarity, keywords and topic indexing, etc. channels, and execute reranking, deduplication, and diversity control on unified candidate pools to form context candidate collections.

Among them, topic indexing defined as one recall channel of the retrieval layer, subject to Context Plan and budget constraints; indexing construction follows incremental triggering, normalization merging, and auditable relation graph three mechanisms, avoid topic drift causing recall instability and maintenance cost increase.

### 9.4 Context Compiler: Budget Allocation, Conflict Resolution, and Evidence Chain Binding

The system uses "context compiler" to compile candidate collections into final message sequences submitted to LLM. The compiler provides three capabilities:

- Budget allocation: Allocate token quotas and entry quotas to different semantic segments from global budget, execute interpretable cropping for over-budget candidates.

- Conflict resolution: When same fact exists multiple versions or mutually contradictory sources, select based on source reliability, time freshness, and confidence, or explicitly expose conflicts for upper strategy handling.

- Evidence chain binding: Bind key facts with their source identifiers, forming "output—evidence" mappings, providing basis for error diagnosis, replay evaluation, and compliance audit.

### 9.5 Observable and Evaluation Loop: From Strategy Comparison to Systematized Improvement

The system supports long-term evolution with evaluation loops. Each build records Plan, candidate collections, final contexts, and task results, evaluates key fact recall, false recall, conflict exposure, delays, and costs, etc. metrics in offline replay and online contrast experiments (Section 8). Under this loop, control plane and data plane strategies become comparable experimental factors, forming systematized improvement paths.

---

## 10. Conclusion

This paper systematically proposes PCM and resident multi-stream interactive Agent architecture: uniformly model user inputs and environmental changes as event streams, drive parallel retrieval and context assembly with Context Plan as control plane under budget constraints, thereby improving task-state context precision and availability. This paper gives "lossless memory" operational definition, analyzes risks of relying solely on LLM for intent recognition and topic mining in stability, cost, and consistency, proposes system decomposition for achieving "controllable precision": control plane, data plane, compiler, and feedback loop. Finally, this paper gives module boundaries and data architecture engineering organization methods, ensures scheme reproducibility and measurability with metric systems and experimental protocols.
