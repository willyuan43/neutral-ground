# Neutral Ground 交接说明（HANDOFF）

更新：2026-10-25（周日）14:30 PDT · 写给接手的人，以及任何账号下新开的 Claude。

## 0. 先读这里

- **这是什么：** Neutral Ground，一款 6–8 分钟的网页游戏，参加 Hack for Social Impact 2026 的 UNCCD 赛题（周六 10/24 – 周日 10/25，Wefunder HQ，旧金山）。周日 15:00 交可玩的演示。
- **现在的状态：** 演示版已完成，是第 13 版（加了制作者署名）。演示幻灯片（15 页）、游戏简介（How to Play）和 Devpost 项目故事（`handoff\devpost-project-story.md`）也已完成。
- **制作者：** Team Will-Ai（Hao Dong Yuan、Chieh Lin Chung），Hack for Social Impact 2026 · UNCCD challenge。署名写在 `src/content/credits.ts`，标题页、暴雨开场、About、结局页和分享图都从这里读。
- **唯一可信来源：** 这台电脑上的文件夹 `C:\Users\willy\Projects\neutral-ground`。其中游戏代码在 `prototype\`，这份说明在 `prototype\handoff\`。
- **原账号里的东西换账号打不开：** 网页版游戏、幻灯片、在线文档，以及 claude.ai 项目 “UN” 里的文档。它们在 `handoff\` 里都有副本（见第 8 节）。
- **接手顺序：**
  1. 读这份说明。
  2. 读 `prototype\NOTES.md` 最后四节（10/25 的部分）。
  3. 需要背景时，读 `handoff\project-docs\` 下的几份方案。
  4. 看源码（第 2 节有地图）。

## 1. 一句话和赛题

**一句话：** 2022 年除夕，一场真实的大暴雨袭击旧金山。你有三个秋天，把真实的 Glen Canyon 公园准备好。

- **赛题：** 用真实的卫星和 GIS 数据做游戏，让年轻人（15–24 岁）理解土地利用的取舍、参与社区土地规划。它批评 Minecraft（Block by Block）资源无限、地形随便捏、没有后果。
- **评分：** 现场技术演示 35%，影响和问题解决 30%，创新 20%，演示和讲故事 15%。来源是官方 Hack Pack，见 `handoff\project-docs\design-review-2026-10-24.md`。
- **我们的回答：**
  - 资源有限：教学代币、汗水、水。
  - 地形真实：5 米激光雷达。
  - 后果来自真实天气：重放 2020–2023 年每天的雨，加上逐小时的除夕暴雨。
  - 由一个透明的教学模型计算结果。

## 2. 文件地图

| 想找什么 | 在哪 |
| --- | --- |
| 双击就能玩的离线版（13.5 MB） | `prototype\dist-single\neutral-ground.html` |
| 开发日志（中文，按时间） | `prototype\NOTES.md` |
| 这份交接说明和所有副本 | `prototype\handoff\` |
| 演示幻灯片 PDF / 源文件 | `handoff\presentation\Neutral-Ground-Presentation.pdf`；`handoff\presentation\source\`（deck.json、每页 HTML、图片） |
| 游戏简介（How to Play） | `handoff\How-to-Play.md` 和 `handoff\How-to-Play.docx` |
| claude.ai 项目文档的副本 | `handoff\project-docs\` |
| 更早的设计和计划 | `docs\`（`11` 玩法设计 v0.5、`13` 执行计划、`04` 模型、`DECISIONS.md`）、`START-HERE.md` |

源码（Vite + React 18 + TypeScript，three.js + React Three Fiber + drei，zustand）：

| 文件 | 做什么 |
| --- | --- |
| `src/ui/campaign/Campaign.tsx` | 整局的状态机：开场、三个秋天、回放、暴雨、结局；任务清单、提示、行动按钮、玩家角色的接线 |
| `src/ui/campaign/Guide.tsx` | 引导层：暴雨预告、任务卡（三颗星）、任务清单、邻居请求卡 |
| `src/ui/campaign/scenes.tsx` | 东坡和活动中心的 3D 场景内容：苗床、木栏、人物站位、缺水按钮 |
| `src/stage/Characters.tsx` | 3D 人物（GLB、共用骨骼、动作重定向）；`PlayerFigure`（玩家角色）；`Beacon`（指路箭头） |
| `src/stage/Stage.tsx` | 画布、镜头（`viewFor`、`CameraRig`、`FollowCam` 跟随玩家）、地面点击 |
| `src/stage/ParkIsland.tsx`、`look.ts`、`real/*` | 玩具风的岛：地形上色、树、房子、草 |
| `src/campaign/campaign.ts` | 三年规则、任务、结局判定（`endingOf`）、预算 |
| `src/model/*` | 模型：逐日土壤水分、SCS 曲线数产流、雨水花园和水池、坡地 |
| `src/content/*` | 文字：邻居（`npcs.ts`）、结局（`endings.ts`）、成就、预测题、证据卡 |
| `src/levels/slopeDisplay.ts` | 苗床怎么画（只是显示，模型只算面积） |
| `src/ui/art.ts` | 图片和模型的地址；单文件版里从内嵌 base64 直接解码（`artBytes`） |
| `scripts/build-single.mjs` | 打包单文件版，把 `dist/art` 和 `dist/data` 内嵌进去 |
| `public/data/` | 真实数据：地形、土地覆盖、天气、站点等；`manifest.json` 列出每个来源 |
| `public/art/` | 人物 GLB、动作 GLB、头像、插画（Higgsfield 生成） |

## 3. 现在的游戏怎么玩（第 13 版）

1. **开场：**
   - 暴雨预告：2022 年 12 月 31 日夜里的大雨，“一天 139 mm”是观测数据。然后倒带到 2020 年秋。
   - “📍 Glen Canyon Park · San Francisco · 真实地点”。
   - Maya 说：“你是新来的峡谷守护者”，以及“暴雨冲走裸露的土，本地草的根能抓住它”。
2. **任务卡上的三颗星就是结局规则：**
   - 🌱 草地回来（Maya 的任务：≥ 1,000 m²，草地不净减）。
   - ⛈ 暴雨最大一小时 ≤ 100 m³（Ms. Chen 的任务；什么都不做时是 107.3）。
   - 🤝 四位邻居里帮到至少 3 位。
3. **你控制 Juno（▼ You）：**
   - 电脑用 WASD 或方向键走，也可以点地面；手机点地面走。镜头跟着你。
   - 右下角的大按钮随所在位置变（空格或 E 也能按）：
     - 🌱 Plant here：在脚下种 250 m²，花 1 代币。
     - 💬 Talk to Leo。
     - 📍 Field note：真实地名，收满 5 个得徽章。
     - 🥾 The shortcut。
     - 💧 Water them：回放时幼苗缺水才出现。
4. **一直在屏幕上的提示：**
   - 左上是任务清单，带暴雨倒计时。
   - 顶部是一句提示，加季节轨道 2020 · 2021 · 2022 · ⛈。
   - 黄色指路箭头：指向最近的金色山坡、等你的 Leo、缺水的苗、2021 年要补种的地方。
5. **2020 年秋：**
   1. 播种。
   2. 选浇不浇水。
   3. Leo 从小路上来挥手，走过去对话后弹出请求卡。
   4. 这些都做完，“Play the year”才亮；按下还要再确认一次（“▶ Start the year”）。第一年不下注。
6. **回放一年（约 17 秒）：**
   - 缺水时停下来问你。
   - 选“不浇”之后，可以随时点缺水按钮，或走过去浇。
   - 年底出结算：存活率、草地等级（Seedbed → Wild meadow）、一句教训、同样天气下其它选择的结果。
7. **2021 年秋只能做一件事：** 补种，或给 Leo 种遮阴树。之后的下注是可选的（“Guess it! 🎯”）。
8. **2022 年秋，活动中心：** Ms. Chen 和 Coach 提出请求；选雨水花园的大小和 A–F 的位置，或建屋顶水池。
9. **除夕暴雨：** 逐小时播放，点“This is the peak!”预测最大的一小时。之后是暴雨结算。
10. **结局：** 8 种之一，显示三颗星拿到几颗，加上徽章（共 18 个）和岛上的装饰。装饰存在浏览器里。

## 4. 整个过程：每次反馈和改动的原因

| 时间 | 发生了什么 | 改了什么 |
| --- | --- | --- |
| 10/24 凌晨 | 写执行计划（`docs/13`）；定方向：Glen Canyon、真实数据、两轮（东坡草地、活动中心暴雨） | 原型的三关（东坡、暴雨两关） |
| 10/24 上午 | 官方 Hack Pack 公布，对照评审（`design-review`） | 补上社会和经济的取舍，提案卡连到真实的参与渠道 |
| 10/24 晚 | 试玩版方案 v1.1（`trial-plan-v1`），吸收 Gemini 和 GPT 两轮意见，用模型核对了水池 | 一局“峡谷季”：三个秋天加除夕暴雨、四位邻居和任务、8 种结局、成就、提案卡 |
| 10/25 凌晨 | 做成游戏，三轮独立评审分别打 5、6、6.5 分 | 提示一次一行；结算单一屏看完；暴雨更像暴雨；重玩的动力 |
| 10/25 上午 | 用户第一次试玩，在开头两屏就放弃了，五条意见见 `redesign-v2` | 玩具岛画风，航片改成一个图层；Higgsfield 和 Meshy 生成真 3D 人物和 6 个共用动作；故事开场代替“选四位邻居”；底部工具栏代替卡片；文字减少 |
| 10/25 中午 | 用户：“要像养成和 Minecraft 那样，有成就感、照料、创作，让人回来玩” | 自己选草地的位置；缺水时的照料按钮；草地等级和升级彩纸；岛上的装饰。并行跑了两个审查子任务：修 9 个 bug、精简 25 条文案、改 5 处碰到约束的话 |
| 10/25 中午 | 网页版里 3D 人物不显示（artifact 的安全规则不许 fetch data: 地址） | GLB 从内嵌 base64 直接解码，贴图改走 `<img>` |
| 10/25 中午 | 第三方新手试玩：不知道这是哪里、为什么在这、人物干嘛、该做什么；人物不能走；点一两下就过一年；“像教学视频，不像游戏” | 可控角色和跟随镜头；现场行动按钮；暴雨预告；任务卡三星；任务清单；请求卡；指路箭头；开始一年前要确认；第一年不下注；画面变化更明显 |
| 10/25 13:00 | 演示材料 | 15 页幻灯片、How to Play 文档、演示前清单 |

## 5. 不能破的规则

- 不修改任何 BAYLINK 仓库。
- `app/.env.local` 里是用户的密钥：不读、不打印、不复制、不提交。会场不用 `npm run dev:lan`。
- 只在 `prototype/` 里写，不碰 `app/`。`docs/DECISIONS.md` 允许加的那一行已经加过，不再改。
- 不编造数据。屏幕上的每个数字都来自模型或观测数据，并标 model 或 observed。不让 LLM 自己生成数字或比较。
- 不说物种来了、走了或数量变化，也不画动物出现。不画模型没算的结果：内涝、扬尘、水质、地面干爽。
- 2006 年的管理分区是历史资料，近似边界。不出现“已批准”“会被资助”“已证明有效”。
- 预算是教学代币，不说成真实美元。
- LDN 检查只是“受 LDN 启发”的教学指标，不是官方 SDG 15.3.1 评估。
- 邻居都是虚构的，标 “Simulated neighbor”；3D 名牌上有小小的 “sim” 标记。AI 生成的结局图写明是 AI 插画。

## 6. 怎么构建、测试、发布、同步

- **在哪里改：**
  - 在云端复制一份 `prototype/` 去改（不带 node_modules 和 dist）。
  - 不要在共享文件夹里 `npm install`。
  - 只把改过的文件写回文件夹，不写 node_modules、dist、package-lock.json、assets-in。
- **构建：**
  - `npx tsc --noEmit`
  - `npx vite build`
  - `node scripts/build-single.mjs`，生成 `dist-single/neutral-ground.html` 和 `neutral-ground.fragment.html`；后者是给 artifact 用的。
- **截图测试：**
  - 用 `npx vite preview`（端口 4173），不要用开发服务器，热更新会打断流程。
  - `shot.cjs` 按 JSON 步骤点按钮、截图（`tools/shotbg.sh` 后台跑，`tools/shotkill.sh` 停）。手机尺寸加 `MOBILE=1 W=390 H=844`。
  - 云端只有 2 个 CPU，一次只跑一个。不要用 `pkill -f`，它会杀掉自己的 shell。
- **网址参数：**
  - `?shot`：截图时冻结 3D、跳过 N8AO、气泡显示 3 倍时长。
  - `?fast`：回放瞬间完成。
  - `?shot&hold=storm` / `hold=rewind`：停在开场的那一幕。
- **测试钩子（只在 `?shot` 下有）：**
  - `window.__ngGround(r, c)`：让玩家走到那一格。
  - `window.__ngTeleport(r, c)`：直接移过去。
  - `window.__ngSpots`：人物站在哪。
- **网页版（artifact）：**
  - 把 `dist-single/neutral-ground.fragment.html` 发布到同一个链接。
  - artifact 不允许 fetch data: 地址，也不允许下载。所以模型要直接解码；保存图片的按钮会弹出图片，让人右键或长按保存。
- **同步回电脑：**
  1. 先比对电脑上文件的哈希和云端的基线 `orig/`，确认用户没改过。
  2. 再写入。
  3. 写完更新基线。
- **Higgsfield 的文件：**
  - CDN 只能通过 app 内置浏览器取。每段 ≤ 240k 字符，用 `tools/joinlast.sh` 拼回。
  - 3D 模型的流程：GPT Image 2.5 生成人物图 → Meshy 7 image-to-3D（带贴图、自动绑骨）→ gltf-transform 和 meshoptimizer 简化、量化。

## 7. 已知问题和下一步

- **网页版的保存按钮：** artifact 不允许下载，所以改成弹出图片；离线单文件版里会直接下载。
- **电脑上残留 5 个不再使用的旧文件**（`public/art` 里的 `logo.webp`、`tex-cypress`、`tex-euc`、`tex-grass-dry`、`tex-soil`）。删除需要用户授权；它们不影响游戏，可以留着。
- **第 4 轮独立评审没跑：** 时间都给了用户和第三方的真人试玩。
- **还没做：**
  - 联网的 Ask Juno（AI 问答）
  - 多人座位和社区看板
  - 换一个天气年份
  - 站点护照
- **赛后的下一步：**
  - 课堂试点，配游戏简介。
  - 用同一套公开数据的流程换到别的公园。
  - 西班牙文和中文版。
  - 见 `trial-plan-v1` 的 3 个月计划。
- **演示前：** 用无痕窗口，或在标题页 Collection → “Clear the collection”（点两下）。浏览器会记住排练时的结局、徽章和装饰。

## 8. 原账号的链接和本地副本

| 东西 | 原账号的链接（换账号打不开） | 本地副本 |
| --- | --- | --- |
| 游戏网页版（第 13 版） | https://claude.ai/artifact/N2KNRSqUg41rRKYGAdUKvA | `prototype\dist-single\neutral-ground.html` |
| 演示幻灯片（15 页） | https://claude.ai/artifact/R1ZppPoApW5f64iYmniE7G | `handoff\presentation\` |
| How to Play 在线文档 | https://claude.ai/artifact/S72bDtDyjcuqmQR9rwxQw8 | `handoff\How-to-Play.md` 和 `.docx` |
| 试玩版执行方案 v1.1（在线文档） | https://claude.ai/artifact/AaTdBzitdoWuvwGTnJcKoT | `handoff\project-docs\trial-plan-v1.md` |
| claude.ai 项目 “UN” 的文档 | 项目 UN | `handoff\project-docs\` |
| Devpost「About the project」英文稿 | （无，直接贴到 Devpost） | `handoff\devpost-project-story.md` |

新账号想要网页版：把 `neutral-ground.fragment.html` 当作 artifact 重新发布一次即可。

## 9. 给新 Claude 的开工指令（可以整段贴进新对话）

```text
你接手 Neutral Ground（HSI 2026 · UNCCD 赛题的网页游戏）。先读电脑上的
C:\Users\willy\Projects\neutral-ground\prototype\handoff\HANDOFF.md（交接说明），
再读 prototype\NOTES.md 最后四节。文件夹是唯一可信来源。
遵守 HANDOFF.md 第 5 节“不能破的规则”和第 6 节的工作方式：
在云端副本里改，构建后把改过的文件写回文件夹，写之前先核对哈希。
先用 5 行以内复述你理解的现状，再问我这次要做什么。
```
