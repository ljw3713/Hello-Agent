# Hello Agent

一个最小化的 TypeScript + Express AI Agent 示例项目。

项目通过网页接收用户输入，后端默认调用 Gemini API 获取一段回复，然后模拟模型要求调用本地工具，统计当前项目目录下的文件数量，并把结果返回到网页中展示。

项目中也保留了 DeepSeek API 客户端示例，方便后续切换或对比不同模型服务。

注意：当前示例只演示 LLM 调用和本地工具调用，没有接入实时天气 API。类似“今天上海天气”这类实时问题会由 Gemini 根据自身能力回答，但不会自动查询实时天气数据。

## 功能

- 使用 Express 提供网页服务
- 使用 TypeScript 编写后端代码
- 通过网页表单和 Agent 交互
- 默认通过官方 `@google/genai` SDK 调用 Gemini API
- 保留 DeepSeek Chat Completions API 客户端
- 定义标准化 `ToolInterface`
- 根据已注册工具自动生成 tool function schema
- 定义标准化 `AIClientInterface`
- AI 可直接返回最终答案，也可以选择调用本地工具
- 使用本地工具统计当前目录文件数量或查询当前目录结构
- 每个 Agent 执行步骤都会输出日志
- 支持多轮工具调用，直到 AI 给出最终答案或达到最大轮数
- 请求进入 Agent 后会先查询 Qdrant，检索相似内容作为 RAG 上下文
- 提供独立图片识别页面，可上传图片并调用 Gemini Vision 能力识别图片内容

## 项目结构

```text
hello_agent/
├── package.json
├── tsconfig.json
├── .env.example
├── README.md
├── public/
│   └── index.html
└── src/
    ├── server.ts
    ├── agent.ts
    ├── aiClientInterface.ts
    ├── geminiClient.ts
    ├── deepseekClient.ts
    ├── logger.ts
    └── tools/
        ├── toolInterface.ts
        ├── toolRegistry.ts
        ├── directoryTools.ts
        └── countFiles.ts
```

## 配置

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

然后在 `.env` 中填写你的 Gemini API Key：

```text
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-1.5-flash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat
PORT=3000
```

当前 Agent 默认使用 Gemini。`DEEPSEEK_API_KEY` 和 `DEEPSEEK_MODEL` 是保留配置，当前主流程不会使用。

## 安装依赖

```bash
npm install
```

## 启动 Qdrant

项目使用 Docker Compose 启动本地 Qdrant 服务：

```bash
docker compose up -d qdrant
```

Qdrant HTTP API 地址：

```text
http://localhost:6333
```

检查服务状态：

```bash
curl http://localhost:6333
```

可选 Qdrant 配置可以放在 `.env` 中：

```text
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=hello_agent_docs
QDRANT_VECTOR_NAME=Default
QDRANT_SEARCH_LIMIT=5
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_EMBEDDING_DIMENSION=384
```

`QDRANT_VECTOR_NAME` 用于查询 named vector collection，例如 Dashboard 示例数据里的 `Default`。`GEMINI_EMBEDDING_DIMENSION` 可以控制 Gemini embedding 输出维度；但 RAG 检索效果要求“入库 embedding 模型”和“查询 embedding 模型”一致，仅维度一致不代表语义空间一致。

当前代码会先用 Gemini embedding 生成用户问题向量，再查询 Qdrant。执行日志会打印：

```text
Qdrant 请求信息
Embedding 生成状态
Embedding 向量值
Qdrant 相似检索状态
Qdrant 查询结果
```

网页中提供 Markdown / TXT 导入模块。导入流程：

```text
输入 Markdown 或 TXT
  ↓
服务器按三位数字编号解析诗歌，每首诗一个切片
  ↓
每个切片保存为 JSON：编号、作者、诗名、内容
  ↓
对每个切片调用 Gemini embedding
  ↓
自动创建或复用 Qdrant collection
  ↓
写入切片原文、metadata 和向量
```

如果 collection 已存在，但向量维度和当前 embedding 输出维度不一致，导入会失败并在日志中说明原因。

导入接口会返回耗时指标，用于观察数据量和时间的关系：

```text
totalCharacterCount
chunkCount
chunkingDurationMs
embeddingDurationMs
averageEmbeddingDurationMs
upsertDurationMs
totalDurationMs
chunkEmbeddingMetrics
```

## 本地运行

开发模式：

```bash
npm run dev
```

然后访问：

```text
http://localhost:3000
```

图片识别页面：

```text
http://localhost:3000/image.html
```

图片识别接口会根据图片原始大小选择提交方式：

```text
小于 20MB：使用 inlineData 直接提交给 Gemini
大于等于 20MB：先通过 Gemini Files API 上传，再把 file uri 交给 Gemini 识别
```

## 构建和生产运行

```bash
npm run build
npm start
```

## Agent 流程

```text
用户在网页输入消息
  ↓
Express 接收 POST /api/chat 请求
  ↓
Agent 生成用户问题 embedding 并查询 Qdrant
  ↓
Agent 将 Qdrant 检索结果作为 RAG 上下文
  ↓
Agent 创建工具注册表并生成 tool function schema
  ↓
Agent 第一次调用 Gemini
  ↓
如果 AI 返回最终答案，直接返回用户
  ↓
如果 AI 返回 tool call，Agent 执行对应本地工具
  ↓
Agent 把已有工具结果继续交给 Gemini
  ↓
Gemini 判断继续调用工具或生成最终答案
  ↓
返回最终答案、工具调用信息、工具结果和执行日志
```
