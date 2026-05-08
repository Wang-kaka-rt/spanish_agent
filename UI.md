# 西班牙合同智能Agent — 前端 UI 设计规范

> 更新时间：2026-05-08
> 适用：Electron + React + Tailwind CSS 前端实现参考

---

## 一、设计风格定位

**整体风格：** 专业、简洁、沉稳
面向律所、移民中介等专业机构，界面需要传递**可信赖**和**高效率**的感觉，避免花哨的动效和复杂的视觉噪声。参考 Linear、Notion、Vercel 控制台的极简专业风格。

**核心原则：**
- 内容优先：合同文本和表单是主角，UI 是服务者
- 信息密度适中：专业用户不需要过度引导，但也不能过于密集
- 操作反馈明确：生成合同、抓取法律等耗时操作要有清晰状态提示
- 中西双语内容兼容：合同区域使用等宽字体，支持中文和西班牙语混排

---

## 二、色彩系统

### 主色调

```
主色   Indigo-600    #4F46E5    主按钮、激活状态、链接
主色浅  Indigo-50     #EEF2FF    主色背景色、选中行背景
主色暗  Indigo-700    #4338CA    主按钮 hover 状态
```

### 中性色（灰阶）

```
背景色   Gray-50      #F9FAFB    页面主背景
面板色   White        #FFFFFF    卡片、侧边栏、面板背景
边框色   Gray-200     #E5E7EB    分割线、输入框边框
次文字   Gray-400     #9CA3AF    提示文字、时间戳
正文     Gray-700     #374151    正文内容
标题     Gray-900     #111827    页面标题、重要文字
侧边栏背景 Gray-900   #111827    左侧导航背景
侧边栏文字 Gray-400   #9CA3AF    非激活导航项文字
侧边栏激活 White      #FFFFFF    激活导航项文字
```

### 功能色

```
成功   Green-600    #16A34A    操作成功、已缓存状态
警告   Amber-500    #F59E0B    草稿状态、注意提示
错误   Red-500      #EF4444    操作失败、错误提示
信息   Blue-500     #3B82F6    信息提示、生成中状态
```

### 状态标签色

```
draft      Amber-100 背景  Amber-700 文字    草稿
confirmed  Green-100 背景  Green-700 文字    已确认
exported   Blue-100 背景   Blue-700 文字     已导出
```

---

## 三、字体系统

```css
/* 界面文字：使用系统字体栈，支持中文 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
             "PingFang SC", "Hiragino Sans GB",
             "Microsoft YaHei", sans-serif;

/* 合同内容区域：等宽字体，中西文混排清晰 */
font-family: "JetBrains Mono", "Fira Code",
             "Courier New", monospace;

/* Monaco Editor 内部：自动使用等宽字体 */
```

### 字号规范

```
xs    12px    时间戳、角标、辅助说明
sm    14px    表格内容、输入框文字、按钮文字
base  16px    正文、表单标签
lg    18px    卡片标题、区块小标题
xl    20px    页面标题
2xl   24px    主页面大标题
```

---

## 四、间距与圆角

```
间距基准：4px（Tailwind 默认 1 = 4px）
常用：p-2(8px)  p-3(12px)  p-4(16px)  p-6(24px)  p-8(32px)

圆角：
  按钮、输入框   rounded-md   6px
  卡片、面板     rounded-lg   8px
  标签、徽章     rounded-full 全圆
  弹窗           rounded-xl   12px
```

---

## 五、整体布局结构

```
┌────────────────────────────────────────────────────────┐
│  标题栏（Electron 原生，高度 32px，拖拽区域）            │
├──────────┬─────────────────────────────────────────────┤
│          │                                             │
│  左侧    │              主内容区                        │
│  导航栏  │                                             │
│  220px   │         flex-1，自动填充剩余宽度             │
│          │                                             │
│  固定    │                                             │
│  不滚动  │                                             │
│          │                                             │
└──────────┴─────────────────────────────────────────────┘
```

**Electron 窗口：** 默认宽 1280px，高 800px，最小宽 1024px

---

## 六、左侧导航栏

**背景：** `bg-gray-900`
**宽度：** `w-[220px]` 固定，不可折叠（V1.0）

```
┌──────────────────────┐
│                      │  ← bg-gray-900
│  ⚖ ContractAgent    │  ← 产品名，text-white text-sm font-semibold
│                      │     图标使用 Lucide Scale 或自定义 SVG
│  ─────────────────   │  ← border-gray-700 分割线
│                      │
│  主功能               │  ← text-gray-500 text-xs uppercase 分组标签
│                      │
│  ▶ 合同生成           │  ← 激活：bg-gray-800 text-white
│    模板管理           │  ← 非激活：text-gray-400 hover:text-white
│    法律库             │     hover:bg-gray-800
│    问答               │
│                      │
│  ─────────────────   │
│                      │
│  系统                 │
│                      │
│    设置               │
│                      │
│                      │
│  ─────────────────   │
│  ● 服务器已连接       │  ← 底部状态：green-400 dot + text-gray-400
└──────────────────────┘
```

**导航项样式：**
```
非激活：flex items-center gap-3 px-3 py-2 rounded-md
        text-gray-400 text-sm hover:text-white hover:bg-gray-800
        cursor-pointer transition-colors

激活：  flex items-center gap-3 px-3 py-2 rounded-md
        text-white bg-gray-800 text-sm font-medium
```

**图标：** 使用 Lucide React，size=16，与文字对齐
- 合同生成：`FileText`
- 模板管理：`FolderOpen`
- 法律库：`BookOpen`
- 问答：`MessageSquare`
- 设置：`Settings`

---

## 七、页面通用组件

### 页面标题区

```
┌─────────────────────────────────────────────────────┐
│  合同生成                              [主操作按钮]   │
│  根据订单信息自动生成合同                             │
│                                                     │
│  ─────────────────────────────────────────────────  │
└─────────────────────────────────────────────────────┘
```

```
大标题：text-xl font-semibold text-gray-900
副标题：text-sm text-gray-500 mt-1
分割线：border-b border-gray-200 pb-4 mb-6
```

### 按钮规范

```
主按钮（Primary）
  bg-indigo-600 hover:bg-indigo-700
  text-white text-sm font-medium
  px-4 py-2 rounded-md
  transition-colors

次按钮（Secondary）
  bg-white hover:bg-gray-50
  text-gray-700 text-sm font-medium
  border border-gray-300
  px-4 py-2 rounded-md

危险按钮（Danger）
  bg-white hover:bg-red-50
  text-red-600 text-sm font-medium
  border border-red-200
  px-4 py-2 rounded-md

图标按钮（Icon）
  p-2 rounded-md text-gray-400
  hover:text-gray-600 hover:bg-gray-100

加载状态：按钮内显示 Lucide Loader2 旋转图标，disabled
```

### 输入框规范

```
文本框：
  w-full rounded-md border border-gray-300
  px-3 py-2 text-sm text-gray-900
  placeholder:text-gray-400
  focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
  bg-white

多行文本区：
  同上 + resize-none
  订单输入框高度：h-32
  合同编辑区：由 Monaco Editor 接管

下拉选择：
  同文本框样式 + appearance-none
  右侧 Lucide ChevronDown 图标
```

### 卡片（Card）

```
bg-white rounded-lg border border-gray-200 p-6
可加 shadow-sm（轻投影）
```

### 表格规范

```
表头：bg-gray-50 text-xs text-gray-500 uppercase font-medium
      px-4 py-3 border-b border-gray-200

数据行：px-4 py-3 text-sm text-gray-700
        hover:bg-gray-50 transition-colors
        border-b border-gray-100

斑马纹：不使用（hover 高亮替代）
```

### 状态标签（Badge）

```
draft：
  bg-amber-100 text-amber-700
  text-xs px-2 py-0.5 rounded-full font-medium

confirmed：
  bg-green-100 text-green-700
  text-xs px-2 py-0.5 rounded-full font-medium

exported：
  bg-blue-100 text-blue-700
  text-xs px-2 py-0.5 rounded-full font-medium

已缓存（法律）：
  bg-green-100 text-green-700
  text-xs px-2 py-0.5 rounded-full font-medium
```

### Toast 提示

```
右下角弹出，宽 320px，圆角 rounded-lg，shadow-lg
停留 3 秒后自动消失

成功：bg-white border-l-4 border-green-500
      图标：Lucide CheckCircle text-green-500

失败：bg-white border-l-4 border-red-500
      图标：Lucide XCircle text-red-500

信息：bg-white border-l-4 border-blue-500
      图标：Lucide Info text-blue-500
```

### 加载状态（全页）

```
半透明遮罩 + 居中 Spinner：
  <div class="fixed inset-0 bg-white/60 flex items-center justify-center z-50">
    <Loader2 class="animate-spin text-indigo-600" size=32 />
    <p class="mt-3 text-sm text-gray-500">正在生成合同，请稍候...</p>
  </div>
```

---

## 八、合同生成页（ContractGenerate）

### 布局

左右双列，左侧输入区（2/5），右侧结果区（3/5）。生成前右侧显示空态引导。

```
┌─────────────────────────────────────────────────────────────┐
│  合同生成                                                    │
│  根据订单信息自动匹配模板并生成合同                            │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐ │
│  │  输入订单信息          │  │  生成结果                     │ │
│  │                      │  │                              │ │
│  │  ┌────────────────┐  │  │  （空态）                     │ │
│  │  │ 粘贴订单信息   │  │  │                              │ │
│  │  │ 或直接输入...  │  │  │  ┌──────────────────────┐   │ │
│  │  │                │  │  │  │                      │   │ │
│  │  │                │  │  │  │   拖拽文件到此处      │   │ │
│  │  └────────────────┘  │  │  │   或输入订单信息后    │   │ │
│  │                      │  │  │   点击生成合同        │   │ │
│  │  使用模型             │  │  │                      │   │ │
│  │  [claude-opus-4-7 ▼] │  │  └──────────────────────┘   │ │
│  │                      │  │                              │ │
│  │  [  生成合同  ]       │  │                              │ │
│  │                      │  │                              │ │
│  │  ── 历史合同 ──       │  │                              │ │
│  │  HE Reagrupación...  │  │                              │ │
│  │  2026-05-07          │  │                              │ │
│  │  [draft]             │  │                              │ │
│  │                      │  │                              │ │
│  │  HE Asesoría legal   │  │                              │ │
│  │  2026-05-06          │  │                              │ │
│  │  [exported]          │  │                              │ │
│  └──────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 生成结果区（有内容时）

```
┌──────────────────────────────────────────────────────────┐
│  生成结果                                                 │
│                                                          │
│  使用模板：HE Reagrupación familiar    [draft ▼]         │
│  引用法律：Ley 4/2000  ×   RD 557/2011  ×               │
│  ──────────────────────────────────────────────────────  │
│  │                                                      │
│  │  [Monaco Editor 区域]                                │
│  │  HOJA DE ENCARGO PROFESIONAL PARA                   │
│  │  TRAMITACIÓN DE EXPEDIENTE DE...                    │
│  │                                                      │
│  │  En Madrid, a 8 de mayo de 2026...                  │
│  │                                                      │
│  │  PRIMERA.- El despacho profesional...               │
│  │                                                      │
│  ──────────────────────────────────────────────────────  │
│              [保存修改]   [导出 DOCX]   [导出 PDF]       │
└──────────────────────────────────────────────────────────┘
```

**Monaco Editor 配置：**
```
theme: 'vs'（白底）
language: 'plaintext'
fontSize: 14
lineHeight: 1.8
wordWrap: 'on'
minimap: { enabled: false }
scrollBeyondLastLine: false
padding: { top: 16, bottom: 16 }
fontFamily: 'JetBrains Mono, Fira Code, Courier New, monospace'
```

### 生成中状态

```
右侧结果区显示进度：

  ┌──────────────────────────────────────────┐
  │                                          │
  │  ✓  提取订单字段                         │  ← Green CheckCircle
  │  ✓  匹配模板：HE Reagrupación familiar   │  ← Green CheckCircle
  │  ○  正在从 BOE 获取法律条文...            │  ← Blue Loader2 旋转
  │  ─  生成合同                             │  ← Gray，未开始
  │  ─  校验                                 │  ← Gray，未开始
  │                                          │
  └──────────────────────────────────────────┘
```

---

## 九、模板管理页（TemplateManager）

```
┌─────────────────────────────────────────────────────────────┐
│  模板管理                            [+ 上传模板]            │
│  管理合同模板文件，支持 DOCX 和 PDF 格式                     │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─ 筛选 ──────────────────────────────────────────────┐   │
│  │  全部  EXTRANJERIA  ASESORAMIENTO  GESTORIA  MERCANTIL│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  分类          子分类          模板名称         操作    │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  EXTRANJERIA   REAGRUPACIÓN    HE Reagrupación  [停用] │ │
│  │                familiar        familiar.docx           │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  EXTRANJERIA   Arraigo         HE Arraigo       [停用] │ │
│  │                extraordinario  extraordinario.docx     │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  ASESORAMIENTO —               HE Asesoría      [停用] │ │
│  │                                legal.docx              │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │  GESTORIA      —               Hoja encargo     [停用] │ │
│  │                                gestoría.docx           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 上传模板弹窗（Modal）

```
┌───────────────────────────────────────┐
│  上传新模板                      [×]  │
│  ─────────────────────────────────── │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │                                 │  │
│  │   ↑ 拖拽文件到此处              │  │
│  │   或点击选择文件                 │  │
│  │   支持 .docx / .pdf             │  │
│  │                                 │  │
│  └─────────────────────────────────┘  │
│                                       │
│  分类  [EXTRANJERIA          ▼]       │
│  子分类 [REAGRUPACIÓN FAMILIAR ▼]     │
│                                       │
│         [取消]    [上传并解析]         │
└───────────────────────────────────────┘
```

**拖拽区样式：**
```
border-2 border-dashed border-gray-300 rounded-lg
bg-gray-50 hover:bg-gray-100
flex flex-col items-center justify-center h-36
cursor-pointer transition-colors

拖拽进入时：border-indigo-400 bg-indigo-50
```

---

## 十、法律库页（LawLibrary）

### 布局

上方搜索区，下方左右分栏（搜索结果 | 已缓存列表）。

```
┌─────────────────────────────────────────────────────────────┐
│  法律库                                                      │
│  从 BOE 官网按需获取西班牙法律条文并缓存到本地数据库           │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─ BOE 搜索 ───────────────────────────────────────────┐  │
│  │  [输入法律名称或 BOE 编号，如"Ley 4/2000"...]  [搜索] │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │  搜索结果                 │  │  已缓存法律               │ │
│  │                          │  │                          │ │
│  │  Ley Orgánica 4/2000     │  │  ✓ Ley 4/2000           │ │
│  │  BOE-A-2000-544          │  │    BOE-A-2000-544        │ │
│  │  2000-01-12              │  │    缓存于 2026-05-07     │ │
│  │  [获取并缓存]             │  │                  [删除]  │ │
│  │                          │  │  ─────────────────────── │ │
│  │  Real Decreto 557/2011   │  │  ✓ RD 557/2011          │ │
│  │  BOE-A-2011-7703         │  │    BOE-A-2011-7703       │ │
│  │  2011-04-20              │  │    缓存于 2026-05-07     │ │
│  │  [已缓存]（灰色禁用）     │  │                  [删除]  │ │
│  │                          │  │  ─────────────────────── │ │
│  │  （搜索前显示空态提示）   │  │  ✓ Código Civil         │ │
│  │                          │  │    BOE-A-1889-4763       │ │
│  │                          │  │    缓存于 2026-05-06     │ │
│  │                          │  │                  [删除]  │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**"获取并缓存"按钮状态：**
```
默认：Secondary 按钮样式
点击中：Loader2 旋转 + "获取中..."，disabled
已缓存：text-green-600，disabled，显示"已缓存"
失败：Toast 错误提示
```

---

## 十一、问答页（Chat）

### 布局

左侧会话列表（240px），右侧对话区（flex-1）。

```
┌─────────────────────────────────────────────────────────────┐
│  法律问答                                                    │
│  基于已有模板和法律库进行专业问答                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │  会话列表  [+新建] │  │  当前会话                        │ │
│  │                  │  │                                  │ │
│  │  家庭团聚材料     │  │  ┌──────────────────────────┐   │ │
│  │  2026-05-07      │  │  │  👤 家庭团聚申请需要什么    │   │ │
│  │                  │  │  │     材料？                │   │ │
│  │  ─────────────── │  │  └──────────────────────────┘   │ │
│  │                  │  │                                  │ │
│  │  公司设立流程     │  │  ┌──────────────────────────┐   │ │
│  │  2026-05-06      │  │  │  🤖 根据 Ley 4/2000 第    │   │ │
│  │                  │  │  │  17 条及 RD 557/2011...   │   │ │
│  │  ─────────────── │  │  │                           │   │ │
│  │                  │  │  │  1. 申请人护照...          │   │ │
│  │                  │  │  │  2. NIE 证件...            │   │ │
│  │                  │  │  │  [流式输出中，光标闪烁]    │   │ │
│  │                  │  │  └──────────────────────────┘   │ │
│  │                  │  │                                  │ │
│  │                  │  │  ─────────────────────────────── │ │
│  │                  │  │  ┌──────────────────────────┐   │ │
│  │                  │  │  │ 输入问题...               │   │ │
│  │                  │  │  └──────────────────────────┘   │ │
│  │                  │  │  使用模型:[claude ▼]  [发送 ↑]  │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**消息气泡样式：**
```
用户消息：
  ml-auto（右对齐）
  bg-indigo-600 text-white
  rounded-lg rounded-br-none
  px-4 py-3 max-w-[70%] text-sm

AI 消息：
  mr-auto（左对齐）
  bg-white border border-gray-200
  rounded-lg rounded-bl-none
  px-4 py-3 max-w-[80%] text-sm text-gray-800
  支持 Markdown 渲染（法律引用加粗、列表等）
```

**流式输出：** 光标用 `|` 字符 + `animate-pulse` 实现

**输入框：** 支持 `Shift+Enter` 换行，`Enter` 发送

---

## 十二、设置页（Settings）

```
┌─────────────────────────────────────────────────────────────┐
│  设置                                                        │
│  配置服务器连接和 AI 模型                                     │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  ┌─ 服务器配置 ─────────────────────────────────────────┐  │
│  │                                                      │  │
│  │  服务器地址                                           │  │
│  │  [https://your-server.com              ]             │  │
│  │                                      [测试连接]      │  │
│  │                                                      │  │
│  │  ● 连接正常，延迟 42ms                               │  │  ← 测试通过：green dot
│  │  ✕ 无法连接，请检查地址或服务器状态                   │  │  ← 测试失败：red cross
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ 模型配置 ──────────────────────────────── [+ 新建] ─┐  │
│  │                                                      │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  ★ Anthropic（默认）            [编辑] [删除]   │  │  │
│  │  │  类型：Anthropic API                            │  │  │
│  │  │  模型：claude-opus-4-7                         │  │  │
│  │  │  温度：0.1                                     │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  本地 Ollama               [设为默认][编辑][删除]│  │  │
│  │  │  类型：本地模型                                  │  │  │
│  │  │  地址：http://localhost:11434/v1               │  │  │
│  │  │  模型：llama3.2                                │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  DeepSeek                  [设为默认][编辑][删除]│  │  │
│  │  │  类型：OpenAI 兼容                               │  │  │
│  │  │  地址：https://api.deepseek.com/v1             │  │  │
│  │  │  模型：deepseek-chat                           │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 新建 / 编辑模型配置弹窗

```
┌───────────────────────────────────────────┐
│  新建模型配置                        [×]   │
│  ────────────────────────────────────── │
│                                           │
│  配置名称                                 │
│  [我的 Claude 配置             ]           │
│                                           │
│  类型                                     │
│  ● Anthropic API                          │
│  ○ OpenAI 兼容（DeepSeek / 通义 / 其他）  │
│  ○ 本地模型（Ollama）                     │
│                                           │
│  ── Anthropic API 时显示 ──              │
│  API Key                                  │
│  [sk-ant-xxxxxxxx...           ] [显示]   │
│                                           │
│  模型 ID                                  │
│  [claude-opus-4-7              ▼]         │
│                                           │
│  ── OpenAI 兼容时显示 ──                 │
│  API 地址                                 │
│  [https://api.deepseek.com/v1  ]          │
│  API Key                                  │
│  [sk-ds-xxxxxxxxx...           ] [显示]   │
│  模型 ID                                  │
│  [deepseek-chat                ]          │
│                                           │
│  ── 本地模型时显示 ──                    │
│  Ollama 地址                              │
│  [http://localhost:11434/v1    ]          │
│  模型 ID                                  │
│  [llama3.2                     ]          │
│                                           │
│  温度（0.0 - 1.0）                        │
│  ●────────○  0.1                         │  ← Slider
│                                           │
│         [取消]        [保存]              │
└───────────────────────────────────────────┘
```

**API Key 输入：** 类型为 `password`，旁边有眼睛图标切换显示/隐藏

---

## 十三、空态设计（Empty States）

每个列表页在无数据时展示引导性空态，避免空白页面。

```
模板管理（无模板）：
  ┌──────────────────────────────────┐
  │                                  │
  │       FolderOpen  (32px icon)    │
  │                                  │
  │      暂无合同模板                │
  │  点击右上角按钮上传第一个模板     │
  │                                  │
  │      [+ 上传模板]                │
  │                                  │
  └──────────────────────────────────┘

法律库（无缓存）：
  图标：BookOpen
  文字：暂无缓存法律，在上方搜索 BOE 并点击"获取并缓存"

问答（新会话）：
  图标：MessageSquare
  文字：开始一个新对话，直接输入问题即可
```

---

## 十四、响应式与窗口尺寸

V1.0 仅支持桌面窗口，不做移动端适配。

```
最小窗口宽度：1024px（electron-builder 限制）
推荐窗口宽度：1280px
推荐窗口高度：800px
默认居中打开：center: true（Electron BrowserWindow 配置）
```

**双栏布局断点：** 低于 1024px 时左侧导航可自动折叠为 icons-only（V1.0 不做，V2.0 优化）

---

## 十五、Tailwind CSS 配置补充

在 `tailwind.config.ts` 中扩展：

```ts
export default {
  content: ['./src/**/*.{ts,tsx}', './electron/**/*.ts'],
  theme: {
    extend: {
      colors: {
        // 保持 Tailwind 默认色板，不自定义，使用语义化类名
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      width: {
        sidebar: '220px',
      },
    },
  },
  plugins: [],
}
```

---

## 十六、Electron 窗口配置（main.ts）

```ts
const win = new BrowserWindow({
  width: 1280,
  height: 800,
  minWidth: 1024,
  minHeight: 600,
  center: true,
  titleBarStyle: 'hiddenInset',  // macOS：隐藏原生标题栏，保留交通灯按钮
  frame: false,                  // Windows：无边框，自定义标题栏
  backgroundColor: '#F9FAFB',   // Gray-50，防止白屏闪烁
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
})
```

**Windows 自定义标题栏：** 在 React 中实现最小化 / 最大化 / 关闭三个按钮，高度 32px，拖拽区使用 `-webkit-app-region: drag`。
