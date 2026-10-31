(() => {
  const STORAGE_KEY = 'xue-landing-lang'

  /** 语言注册表：以后加语言只在这里追加一项，并补上 dict */
  const languages = [
    { code: 'zh', label: '中文', htmlLang: 'zh-CN' },
    { code: 'en', label: 'English', htmlLang: 'en' },
  ]

  const dict = {
    zh: {
      docTitle: '雪澜 · 桌面猫娘',
      docDesc: '雪澜：会动、会聊、会陪你的 Live2D 桌面 AI 桌宠。',
      langToggle: '选择语言',
      navLabel: '页面导航',
      navFeatures: '功能',
      navDownload: '下载',
      heroEyebrow: '桌面 Live2D 猫娘',
      heroLead: '一个有个性、也许有情绪，能默默陪伴你，也能一起聊天互动的AI猫娘桌宠',
      heroCtaPrimary: '获取客户端',
      heroCtaSecondary: '看看能做什么',
      scrollCue: '向下滑动',
      featuresTitle: '她能做的事，简单，但长期...',
      f1Title: '桌面陪伴',
      f1Desc: '她在你的桌面上安静地呆着，可以随时摸摸她&和她聊天，她会一直陪着你~',
      f1DemoHint:
        '右侧为目前使用的Live2D模型（公开模型桃濑日和）雪澜私有的专属模型还排在日程中...',
      f1DemoBadge: '官方样板 · 桃濑日和',
      f1DemoBadgeLive: '官方样板 · 桃濑日和',
      f1DemoTip: '加载 Live2D…',
      f1DemoPetAria: '拖动或点击示意角色',
      f2Title: '文字与语音聊天',
      f2Desc: '即可文字聊天，也可语音快速发送文字内容，无论哪种，她随时都在，也随时会回应你~',
      f2Note: '网络主流大模型接入API_KEY等需自己提供',
      f2Hint: '右侧仅为聊天示意',
      f2Badge: '文字 · 语音',
      f2BubbleMe: '今天有点累',
      f2BubbleHer: '那就休息一下，我随时都在的喵~',
      f2Voice: '语音 · 陪我说说话',
      f2Placeholder: '说点什么…',
      f2Send: '发送',
      f3Title: '音色工坊',
      f3Desc:
        '音色工坊可以通过提示词来生成你想要的音色，并且可以通过自定义触摸语料库，让雪澜做出你最想看到的反应~',
      f3Note: '目前仅支持云端Qwen3.0TTS（包括本地推理）+Bert-Vits本地端实现',
      f3Hint: '右侧仅为音色工坊示意',
      f3StageAria: '音色工坊示意',
      f3Badge: '音色工坊',
      f3CreateIntro: '写一段想要的音色，再补两句摸到她时说的话。',
      f3InstructLabel: '声线描述',
      f3InstructSample: '轻一点，尾音软软的，像在耳边说话',
      f3LinesLabel: '触摸台词',
      f3Generate: '生成声线',
      f3TabUpdate: '更新语料库',
      f3TabCreate: '创造新音色',
      f3Sample: '当前声线 · 默认配置',
      f3PartHead: '头部',
      f3LineHead: '别碰耳朵啦',
      f3PartBody: '身体',
      f3LineBody: '今天也要加油喵~',
      f3Save: '保存并预热',
      f4Title: '层次丰富的记忆系统',
      f4Desc:
        '雪澜会拥有多层次和多维度的记忆系统，确保能够长期记住与你的瞬间，特别是那些很重要的记忆，她都能记得住~时间久了，她也能越来越了解你~',
      f4Hint: '右侧仅为记忆示意',
      f4Badge: '记忆空间',
      f4ShortTitle: '短记忆总结',
      f4ShortBody: '今天有点累，想先歇一下。夜里喜欢安静地待着。',
      f4WeekTitle: '周记忆总结',
      f4WeekBody: '这周忙的时候也会过来戳她，聊过想先休息的事。',
      f4MonthTitle: '月记忆总结',
      f4MonthBody: '这个月大多在夜里陪着，累了会先说一声。',
      f4CoreTitle: '核心记忆池',
      f4Core1: '你喜欢夜里安静地待着',
      f4Core2: '累的时候会想先休息',
      f4Core3: '忙里也会来找她',
      f4ProfileTitle: '用户画像',
      f4NameLabel: '称呼',
      f4Name: '你',
      f4AgeLabel: '年龄',
      f4Age: '未知',
      f4PersonalityLabel: '性格',
      f4Personality: '夜里更安静',
      f4InterestLabel: '兴趣',
      f4Interest: '桌边待着，偶尔聊天',
      f4AttitudeLabel: '对雪澜',
      f4Attitude: '累了会来找她',
      f4SummaryLabel: '总体',
      f4Summary: '忙的时候也愿意被陪着',
      f4HabitLabel: '经常会',
      f4Habit: '夜里说想休息；忙里戳她一下',
      f5Title: '游戏陪聊',
      f5Desc: '当游玩Steam启动的游戏，雪澜可以看到你的屏幕内容，然后冷不丁地吐槽两句~',
      f5Note: '目前仅支持Steam游戏检测且功能默认关闭，因用视觉模型来实现，视觉模型需自己配备',
      f5Hint: '右侧仅为屏幕感知示意',
      f5Badge: '屏幕感知',
      f5Playing: '正在玩 · SuperTuxKart',
      f5Credit: 'SuperTuxKart 贡献者 · CC BY-SA',
      f5Line: '雪澜：这局有点急呀~',
      f6Title: '高度自由的自定义化程度',
      f6Desc:
        '与其说是一只桌宠，不如说更像一个开源的桌宠架构。无论是Live2D模型、角色卡、声线、还是引擎系统等，都提供了抽象层接口，只要接得上，就能改装成只属于你的独一无二的雪澜~',
      f6Hint: '右侧仅为自定义示意',
      f6Badge: '自定义',
      f6ArtLabel: '立绘',
      f6Art: '换成你的 Live2D',
      f6PersonaLabel: '人设',
      f6Persona: '写下她是谁、喜欢什么',
      f6VoiceLabel: '声音',
      f6Voice: '声线，还有摸摸时说的话',
      f6ChatLabel: '聊天',
      f6Chat: '本地模型，或你自己的接口',
      f6HookLabel: '接口',
      f6Hook: '声音、聊天这些引擎，接上就能换',
      stepsTitle: '安装简单，只需三步，就能把她带入你的生活',
      s1Title: '引导式Windows安装包，开盒即用',
      s2Title: '自动化环境安装，简单便捷',
      s3Title: '即可启动桌宠，享受陪伴~',
      ctaTitle: '准备好将她领回家了吗？',
      ctaSoonBadge: '即将开放',
      ctaWin: 'Windows 下载',
      ctaGithub: 'GitHub',
    },
    en: {
      docTitle: 'Xue · Desktop Companion',
      docDesc: 'Xue: a Live2D desktop AI companion that moves, chats, and stays with you.',
      langToggle: 'Choose language',
      navLabel: 'Page navigation',
      navFeatures: 'Features',
      navDownload: 'Download',
      heroEyebrow: 'Live2D desktop companion',
      heroLead:
        'An AI catgirl desktop pet with a personality—maybe even moods—who can quietly keep you company, or chat and play with you.',
      heroCtaPrimary: 'Get the app',
      heroCtaSecondary: 'See what she can do',
      scrollCue: 'Scroll down',
      featuresTitle: 'What she can do — simple, but lasting...',
      f1Title: 'Desktop presence',
      f1Desc:
        'She stays quietly on your desktop — pet her & chat anytime. She’ll keep you company~',
      f1DemoHint:
        'On the right is the Live2D model we use today (public model Hiyori). Xue’s own model is still on the schedule...',
      f1DemoBadge: 'Official sample · Hiyori',
      f1DemoBadgeLive: 'Official sample · Hiyori',
      f1DemoTip: 'Loading Live2D…',
      f1DemoPetAria: 'Drag or tap the mock companion',
      f2Title: 'Text & voice chat',
      f2Desc:
        'Type to chat, or send words quickly by voice. Either way, she’s always here, and she always answers~',
      f2Note: 'You bring your own API key for mainstream cloud models.',
      f2Hint: 'The panel on the right is only a chat sketch.',
      f2Badge: 'Text · voice',
      f2BubbleMe: 'A bit tired today',
      f2BubbleHer: 'Then take a rest — I’m always here, meow~',
      f2Voice: 'Voice · stay and talk',
      f2Placeholder: 'Say something…',
      f2Send: 'Send',
      f3Title: 'Voice workshop',
      f3Desc:
        'The voice workshop can make the voice you want from a prompt, and with your own touch lines, Xue can react the way you most want to see~',
      f3Note: 'For now: cloud Qwen3.0 TTS (including local inference) plus local Bert-VITS.',
      f3Hint: 'The panel on the right is only a workshop sketch.',
      f3StageAria: 'Voice workshop sketch',
      f3Badge: 'Voice workshop',
      f3CreateIntro: 'A note for the voice, plus two lines for when you pet her.',
      f3InstructLabel: 'Voice note',
      f3InstructSample: 'Soft, with a light ending, as if speaking by your ear',
      f3LinesLabel: 'Touch lines',
      f3Generate: 'Make this voice',
      f3TabUpdate: 'Edit lines',
      f3TabCreate: 'New voice',
      f3Sample: 'Current voice · Default',
      f3PartHead: 'Head',
      f3LineHead: 'Not the ears',
      f3PartBody: 'Body',
      f3LineBody: 'Do your best today~',
      f3Save: 'Save and warm up',
      f4Title: 'A layered memory system',
      f4Desc:
        'Xue keeps memory in many layers and angles, so the moments with you stay for a long time. The ones that matter especially stay with her~ Given time, she comes to know you better~',
      f4Hint: 'The panel on the right is only a memory sketch.',
      f4Badge: 'Memory space',
      f4ShortTitle: 'Short summary',
      f4ShortBody: 'A bit tired today, and wants to rest first. Likes the quiet at night.',
      f4WeekTitle: 'Weekly summary',
      f4WeekBody: 'This week, still came by for a poke while busy, and talked about resting.',
      f4MonthTitle: 'Monthly summary',
      f4MonthBody: 'This month was mostly night company. When tired, they say so first.',
      f4CoreTitle: 'Core memory pool',
      f4Core1: 'You like the quiet at night',
      f4Core2: 'When tired, you want to rest first',
      f4Core3: 'You still come find her when busy',
      f4ProfileTitle: 'User profile',
      f4NameLabel: 'Name',
      f4Name: 'You',
      f4AgeLabel: 'Age',
      f4Age: 'Unknown',
      f4PersonalityLabel: 'Temper',
      f4Personality: 'Quieter at night',
      f4InterestLabel: 'Interests',
      f4Interest: 'Staying at the desk, chatting now and then',
      f4AttitudeLabel: 'Toward Xue',
      f4Attitude: 'Comes to find her when tired',
      f4SummaryLabel: 'Overall',
      f4Summary: 'Willing to be kept company while busy',
      f4HabitLabel: 'Often',
      f4Habit: 'Says they want rest at night; pokes her while busy',
      f5Title: 'Chat while you play',
      f5Desc:
        'When you play a game launched from Steam, Xue can see what is on your screen, then drop in a short remark~',
      f5Note:
        'For now only Steam games are detected, and the feature starts off. It uses a vision model, which you need to provide yourself.',
      f5Hint: 'The panel on the right is only a screen-awareness sketch.',
      f5Badge: 'Screen awareness',
      f5Playing: 'Playing · SuperTuxKart',
      f5Credit: 'SuperTuxKart contributors · CC BY-SA',
      f5Line: 'Xue: This round looks rushed~',
      f6Title: 'A high degree of freedom to customize',
      f6Desc:
        'Less one desktop pet, and more an open-source pet architecture. Live2D models, character cards, voices, and the engine system each sit behind an abstract interface. Connect one, and you can rebuild her into a Xue that is yours alone~',
      f6Hint: 'The panel on the right is only a customization sketch.',
      f6Badge: 'Customize',
      f6ArtLabel: 'Art',
      f6Art: 'Bring your Live2D',
      f6PersonaLabel: 'Persona',
      f6Persona: 'Write who she is, and what she likes',
      f6VoiceLabel: 'Voice',
      f6Voice: 'The voice, and lines when you poke her',
      f6ChatLabel: 'Chat',
      f6Chat: 'A local model, or your own API',
      f6HookLabel: 'API',
      f6Hook: 'Voice and chat engines, once the interface fits',
      stepsTitle: 'Simple to install. Three steps, and she is part of your life.',
      s1Title: 'A guided Windows installer, ready as soon as you open it.',
      s2Title: 'The environment installs itself, quick and simple.',
      s3Title: 'Start the pet, and enjoy her company~',
      ctaTitle: 'Ready to take her home?',
      ctaSoonBadge: 'Coming soon',
      ctaWin: 'Windows download',
      ctaGithub: 'GitHub',
    },
  }

  const toggle = document.getElementById('langToggle')
  const menu = document.getElementById('langMenu')
  const currentLabel = document.getElementById('langCurrent')
  let open = false
  let activeLang = 'zh'

  function langMeta(code) {
    return languages.find((l) => l.code === code) || languages[0]
  }

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && dict[saved]) return saved
    } catch {
      /* ignore */
    }
    // 产品约定：未选过时默认中文
    return 'zh'
  }

  function setOpen(next) {
    open = next
    if (!menu || !toggle) return
    menu.hidden = !open
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    toggle.classList.toggle('is-open', open)
  }

  function renderMenu() {
    if (!menu) return
    menu.replaceChildren()
    languages.forEach((item) => {
      const li = document.createElement('li')
      li.setAttribute('role', 'option')
      li.setAttribute('data-lang', item.code)
      li.setAttribute('aria-selected', item.code === activeLang ? 'true' : 'false')
      li.className = 'lang__option' + (item.code === activeLang ? ' is-active' : '')
      li.textContent = item.label
      li.tabIndex = -1
      li.addEventListener('click', () => {
        apply(item.code)
        setOpen(false)
        toggle?.focus()
      })
      menu.appendChild(li)
    })
  }

  function apply(lang) {
    const code = dict[lang] ? lang : 'zh'
    const pack = dict[code]
    const meta = langMeta(code)
    activeLang = code

    document.documentElement.lang = meta.htmlLang
    document.title = pack.docTitle

    const desc = document.querySelector('meta[name="description"]')
    if (desc) desc.setAttribute('content', pack.docDesc)

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n')
      if (key && pack[key] != null) el.textContent = pack[key]
    })

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const key = el.getAttribute('data-i18n-aria')
      if (key && pack[key] != null) el.setAttribute('aria-label', pack[key])
    })

    if (currentLabel) currentLabel.textContent = meta.label
    if (toggle && pack.langToggle) {
      toggle.setAttribute('aria-label', pack.langToggle)
      toggle.setAttribute('title', pack.langToggle)
    }

    renderMenu()

    try {
      localStorage.setItem(STORAGE_KEY, code)
    } catch {
      /* ignore */
    }
  }

  toggle?.addEventListener('click', (e) => {
    e.stopPropagation()
    setOpen(!open)
  })

  document.addEventListener('click', (e) => {
    if (!open) return
    const root = e.target instanceof Element ? e.target.closest('.lang') : null
    if (!root) setOpen(false)
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) {
      setOpen(false)
      toggle?.focus()
    }
  })

  apply(detectLang())
})()
