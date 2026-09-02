export default {
    lang: 'zh-hans',
    title: 'EntropyDrop',
    subtitle: '',
    fontClass: 'font-pixel-hans',
    nav: {
        discover: '发现',
        generate: '生成',
        edit: '编辑',
        print: '3D打印',
        collection: '收藏',
        pro: 'Pro订阅',
        public: '公开',
        about: '关于我们',
        blog: '博客',
        monitor: '监控',
        skin: '皮肤',
        space: 'Space',
        figure: '手办',
        discussions: '讨论',
        showcase: '晒图',
        videos: '视频'
    },
    figureForum: {
        title: '3D 打印手办论坛',
        subtitle: '在这里分享、交流、展示你的像素级 3D 打印手办创作。',
        publishPost: '发布帖子',
        activeMembers: '活跃成员',
        totalPosts: '帖子总数',
        totalPrints: '打印总数',
        postTitle: '标题',
        postContent: '内容描述',
        postCategory: '类别',
        postTags: '标签 (以逗号分隔)',
        postSettings: '3D 打印设置',
        layerHeight: '层高',
        infill: '填充率',
        printerModel: '打印机型号',
        printTime: '打印时长',
        submitPost: '确认发布',
        cancel: '取消',
        comments: '评论回复',
        writeComment: '写下你的评论...',
        commentBtn: '发表评论',
        printSettingsTitle: '打印参数',
        orderPrint: '订购 3D 打印',
        views: '浏览',
        likes: '赞',
        commentsCount: '回复',
        hours: '小时',
        material: '材料',
        bodyTypes: ['单色光固化', 'fdm', '光固化喷墨打印 (UV Inkjet 3D Printing)', '其他/未知'],
        colorModes: ['贴纸', 'UV喷墨', '喷涂', 'fdm多色', '其他/未知'],
        deleteVideo: '删除视频',
        confirmDeleteVideo: '确定要删除这个视频吗？',
        deletePost: '删除帖子',
        confirmDeletePost: '确定要删除这个帖子吗？',
        changePostType: '修改帖子类型',
        changePostTypePrompt: '选择帖子的分类：',
        backToVideos: '返回视频列表',
        addNewVideo: '添加新视频',
        youtubeUrlLabel: 'YouTube 链接或视频 ID',
        publishVideo: '发布视频',
        searchVideosPlaceholder: '搜索视频...',
        searchDiscussionsPlaceholder: '搜索讨论...',
        searchBtn: '搜索',
        addVideoBtn: '添加视频',
        bodyTypeLabel: '主体类型:',
        colorModeLabel: '多色处理:',
        bodyTypeSelect: '主体类型',
        colorModeSelect: '多色处理',
        forumPageLabel: '第 {page} 页，共 {total} 页',
        showcaseImgWarning: '玩家晒图必须包含图片！',
        backToForum: '返回论坛',
        postedBy: '发布者',
        noComments: '暂无评论，来做第一个回复的人吧！',
        noDiscussions: '暂无讨论内容。',
        noShowcases: '暂无玩家晒图。',
    },
    generate: {
        imageMode: '图片生成',
        textMode: '文本生成',
        uploadTitle: '上传参考图',
        uploadHint: '支持 PNG、JPG',
        fileTooLarge: '无法优化此图片以供上传',
        textPlaceholder: '例如: 一个穿蓝衣服的人...',
        imageEditTextPlaceholder: '例如: 把衣服换成红色...',
        textTitle: '提示词',
        btnStart: '开始生成',
        btnGenerating: '正在构建...',
        emptyTitle: '准备好创造了吗？',
        generatingTitle: '创造力爆发中...',
        btnDownload: '下载',
        btnSave: '保存',
        historyTitle: '历史记录',
        historyEmpty: '暂无记录',
        private: '私有',
        public: '公开',
        visibility: '可见性',
        privateTip: 'Pro用户可使用',
        generationFailed: '生成失败: ',
        notice: '提示',
        pleaseUploadImage: '请上传一张图片',
        pleaseEnterDesc: '请输入描述',
        guidanceWarning: '引导系数必须在 0.1 到 15 之间',
        stepsWarning: '推理步数必须在 20 到 120 之间',
        seedWarning: '随机种子必须在 0 到 100000000 之间',
        serverError: '服务器错误',
        failedGetTaskId: '无法获取任务 ID',
        submitSuccess: '提交成功',
        submitSuccessMsg: '任务提交成功！可在左侧历史中查看进度',
        submitFailed: '提交失败',
        submitFailedMsg: '提交任务失败: ',
        loginPrompt: '登录后即可体验模型生成功能',
        statusPending: '排队中',
        statusProcessing: '生成基础图',
        statusPendingSkin: '排队中(生成皮肤)',
        statusProcessingSkin: '正在生成皮肤',
        statusFailed: '失败',
        imageUploadDesc: '上传图片生成',
        noPrompt: '无描述',
        modeLabel: '模式',
        unlockAndClear: '清除并解锁',
        lockedSource: '锁定来源',
        clickReupload: '点击重新上传',
        advancedSettings: '高级设置',
        modelVersion: '模型版本',
        inferenceSteps: '推理步数',
        default: '默认',
        guidanceScale: '引导系数',
        seed: '随机种子',
        random: '随机',
        privateWarning: '私有皮肤在此模式下强制保持私有',
        publicWarning: '公开皮肤生成的皮肤也必须公开',
        ok: '确定',
        dailyQuota: '每日额度',
        remainingQuota: 'Credit 额度: ',
        quotaExceeded: 'Credit 额度不足',
        proTag: '加速',
        loadingModels: '加载中...',
        btnLoadingModel: '正在加载模型...'
    },
    collection: {
        title: '我的收藏',
        subtitle: '管理你保存的每一个方块灵感',
        btnNew: '新建收藏夹',
        typeCollection: '收藏夹',
        labelDefault: '原始创作',
        labelPublic: '自定义收藏夹（公开）',
        labelPrivate: '自定义收藏夹（私有）',
        labelCustom: '自定义收藏',
        uploadFailed: '上传失败',
        fileTooLarge: '文件太大，最大支持 512KB',
        moveFailed: '移动失败',
        renameFailed: '重命名失败',
        confirmDelete: '确定要删除此收藏夹吗？其中包含的皮肤不会被真正删除，如需删除原始文件请前往『我的创作』。',
        confirmDeleteTitle: '确认删除',
        confirmRemoveLike: '确定要移除点赞吗？',
        confirmRemove: '确认移除',
        confirmPermanentDelete: '从这里删除将彻底删除该皮肤及其在所有收藏夹中的关联，确定要删除吗？',
        confirmRemoveShortcut: '仅从当前收藏夹移除快捷方式，原始生成的皮肤不会被删除，如需删除原始文件请前往『我的创作』。确定要移除吗？',
        loginPrompt: '登录后即可查看和管理您的收藏',
        publicCollection: '公共收藏夹',
        myLikes: '我的点赞',
        creationsPublic: '我的创作（公开）',
        creationsPrivate: '我的创作（私有）',
        share: '分享',
        upload: '上传皮肤',
        uploadDestination: '选择上传到的收藏夹',
        chooseImage: '选择图片',
        previousPage: '上一页',
        nextPage: '下一页',
        uploadLicenseTitle: '确认上传许可',
        uploadLicenseMessage: '上传即表示您确认拥有授予许可所需的权利，并同意将该皮肤以 CC BY-NC 4.0 许可提供：任何人可在署名条件下用于非商业目的、分享和修改。该许可不可撤销；设为私有只会限制新的访问，不会撤销此前已合法取得的许可。',
        empty: '这里空落落的',
        create: '创建收藏夹',
        name: '名称',
        visibility: '可见性',
        public: '公开',
        private: '私有',
        btnCreate: '创建',
        rename: '重命名收藏夹',
        btnRename: '重命名',
        btnDelete: '删除',
        enterNewName: '输入新名称...',
        enterName: '输入收藏夹名称...',
        uploadNotSupported: '自定义收藏夹不支持直接上传，请在「我的创作」中上传。',
        linkCopied: '链接已复制到剪贴板',
        moveToCollection: '移动到收藏夹',
        noCollectionAvailable: '没有可选的收藏夹',
        filterName: '按名称过滤',
        filterType: '按类型过滤',
        allTypes: '全部类型',
        modeTextToSkin: 'AI文生皮肤',
        modeImageToSkin: 'AI图生皮肤',
        modeImageEditToSkin: 'AI图像编辑再生成皮肤',
        modeHumanEdit: '人类编辑',
        modeHumanUpload: '人类上传',
        search: '搜索',
        btnGenerate: 'AI生成皮肤',
        confirmMakePrivate: '确定要将此公共创作转为私有吗？(仅Pro可用)',
        makePrivateTitle: '转为私有',
        makePrivatePro: '转为私有 (Pro)',
        privateQuotaExceeded: '免费用户没有私有配额，请升级Pro版',
        deleteQuotaExceededTitle: '额度受限',
        deleteQuotaExceeded: '免费用户每天只能删除1张图，请升级Pro版获取无限制删除。',
        freeDeleteWarning: '\n\n(注意：免费用户每天只能删除1张图，Pro版无限制)'
    },
    edit: {
        importTitle: '导入模型文件',
        importDesc: '导入一张带有皮肤材质的PNG图片(64x64)，开启您的创作。',
        overlay: '外套 (Overlay)',
        pencil: '铅笔',
        eraser: '橡皮擦',
        colorPicker: '取色',
        undo: '撤销',
        redo: '重做',
        import: '导入',
        export: '下载',
        collect: '保存',
        saveToCreations: '保存到我的创作',
        saveAsPublic: '保存为公开',
        saveAsPrivate: '保存为私有',
        saving: '保存中...',
        privateModelWarning: '私有模型编辑后强制保持私有',
        exitReference: '退出当前引用的模型',
        saveSuccess: '保存到我的创作成功',
        saveFailed: '保存失败',
        saveLicenseTitle: '保存后的使用许可',
        saveLicenseChoose: '选择保存后的许可',
        saveLicenseCommercial: '生成者永久商用许可',
        saveLicenseCommercialOption: '商用许可',
        saveLicenseCommercialDescription: '本次编辑将保留您的永久商用许可；若保存为公开，其他用户仍仅获得 CC BY-NC 4.0 非商业许可。',
        saveLicenseCommercialNewDescription: '保存即表示您确认拥有所需商用权利。商用许可仅适用于您的账户；若保存为公开，其他用户仍仅获得 CC BY-NC 4.0 非商业许可。',
        saveLicenseNonCommercialDescription: '保存即表示您确认拥有所需权利，并同意将本次编辑记录为 CC BY-NC 4.0；保存为公开后，任何人可在署名条件下用于非商业目的。',
        saveLicenseUnknown: '许可未知',
        saveLicenseUnknownDescription: '编辑不会扩大来源不明的权利范围；保存为公开也不会向其他用户授予再使用权。',
        saveLicenseLoading: '正在确认许可…',
        saveLicenseLoadingDescription: '正在检查来源皮肤，以显示保存后适用的许可。',
        saveLicenseUnavailable: '暂时无法确认许可',
        saveLicenseUnavailableDescription: '无法验证来源许可，请重新打开原皮肤或稍后重试后再保存。',
        privateProRequired: '保存私有创作需要 Pro 订阅。',
        fileTooLarge: '文件太大，最大支持 512KB',
        invalidDimensions: '尺寸不正确，必须为 64x64',
        slimMode: '纤细型',
        strongMode: '标准型',
        hue: '色相',
        saturation: '饱和度',
        brightness: '亮度',
        contrast: '对比度',
        adjust: '调整',
        kmeans: 'K-Means 减色',
        kmeansClusters: '目标颜色数 (K)',
        kmeansDescription: '通过聚类算法合并相似颜色，使皮肤色彩更干净、像素化更纯粹。',
        kmeansPalettePreview: '调色盘预览'
    },
    user: {
        accountStatus: '账号状态',
        creativeMode: '在线 / 创造模式',
        priorityPoints: '优先级积分',
        profile: '个人资料',
        settings: '设置',
        orders: '我的订单',
        logout: '退出登录',
        regular: '普通用户',
        proExpires: '到期:',
        renewViewPro: '查看 PRO',
        activatePro: '开通 PRO',
        language: '语言',
        login: '登录',
        notifications: {
            title: '消息通知',
            markAllRead: '全部已读',
            empty: '暂无消息',
            like: '点赞了你的帖子',
            comment: '评论了你的帖子',
            reply: '回复了你的评论',
            prev: '上一页',
            next: '下一页',
            pageLabel: '第 {page} / {total} 页'
        },
        profileDialog: {
            googleAccount: 'Google 账号',
            visibleOnlyToYou: '仅自己可见',
            nickname: '昵称',
            nicknamePlaceholder: '请输入昵称...',
            saveNickname: '保存昵称',
            nicknameUpdated: '昵称修改成功！',
            saveFailed: '保存失败',
            networkError: '网络错误，请稍后重试',
            characterReset: '角色已重置',
            resetFailed: '重置失败',
            myCharacter: 'MY CHARACTER',
            resetCharacter: '重置角色',
            resettingCharacter: '重置中...',
            setFromFigureModel: '自手办模型设定',
            noCharacterSet: '尚未设置角色',
            currentAvatar: '当前头像',
            generatedFromMyCharacter: '由 MY CHARACTER 生成',
            syncedFromGoogle: '自 Google 账号同步',
            cancel: '取消'
        }
    },
    common: {
        auto: '跟随系统',
        navigation: '导航',
        authRequired: '请先登录',
        connectError: '无法连接到服务器',
        sessionExpired: '登录已过期，请重新登录。',
        requestFailed: '请求失败',
        requestError: '请求错误',
        networkError: '网络错误',
        networkConnectFailed: '网络连接失败'
    },
    placeholder: {
        building: '模块建设中',
        soon: '更多精彩功能即将上线...'
    },
    orders: {
        support: '订单疑问/售后：',
        loading: '加载中...',
        noOrders: '暂无订单',
        orderId: '订单号',
        orderTime: '下单时间',
        payTime: '支付时间',
        shippingFee: '运费',
        orderItems: '订购项目',
        subscription: '订阅套餐',
        cancelOrder: '取消订单',
        payNow: '立即支付',
        deleteOrder: '删除订单',
        loadMore: '加载更多',
        confirmCancel: '确定要取消此订单吗？',
        confirmDelete: '确定要删除此项目吗？',
        confirmDeleteOrder: '删除后无法恢复，确定要删除此订单吗？',
        cancelSuccess: '取消成功',
        cancelFailed: '取消失败',
        deleteSuccess: '删除成功',
        deleteFailed: '删除失败',
        networkError: '请检查网络连接',
        tip: '提示',
        operationFailed: '操作未能完成',
        networkTitle: '网络错误',
        addToOrderFailed: '加入订单失败',
        addToPendingOrderTitle: '继续选购产品',
        addToPendingOrderHint: '继续选购产品，将自动合并到相同地址的未支付订单中。',
        deleteItem: '删除此项',
        statuses: {
            pending_payment: '待支付',
            paid: '已支付',
            shipping: '配送中',
            completed: '已完成',
            cancelled: '已取消'
        },
        subscriptions: {
            pro_1m: 'PRO - 包月订阅',
            pro_3m: 'PRO - 3 个月',
            pro_6m: 'PRO - 半年',
            pro_1y: 'PRO - 1 年'
        },
        shippingAddress: '收货地址',
        totalAmount: '支付总额'
    },
    pro: {
        title: 'Pro 订阅',
        benefits: '解锁 Pro 专属权益',
        plans: '选择您的订阅计划',
        currentPlan: '当前套餐',
        subscribe: '立即订阅',
        cancel: '取消订阅',
        cancelConfirm: '确定要取消您的 Pro 订阅吗？在当前计费周期结束前，您仍将保留 Pro 身份。',
        cancelSuccess: '您的订阅已取消。',
        cancelFailed: '取消订阅失败',
        recommended: '官方推荐',
        supportText: '订单疑问：',
        successMessage: '订阅成功！Pro 会员已激活。',
        upgrade: '升级',
        buyCreditsTip: '可以根据需要直接购买 Credits 点数',
        buyCreditsBtn: '直接购买 Credits',
        plansData: {
            free: '免费版',
            pro_plus: 'Pro-Plus 订阅',
            pro_max: 'Pro-Max 订阅',
            month: '月'
        },
        perks: {
            free: {
                title: '免费版',
                price: '0',
                quota: '每月登录领取 10 Credit 额度',
                collections: '仅支持公开收藏夹',
                private: '不支持私有空间',
                priority: '普通生成优先级',
                experimental: '基础模型体验',
                commercial: '生成的皮肤按 CC BY-NC 4.0 供任何人非商用'
            },
            pro_plus: {
                title: 'Pro-Plus',
                price: '8',
                quota: '每月额外获得 80 Credit 额度',
                collections: '支持创建私有收藏夹',
                private: '1,000 个私有皮肤上限',
                priority: '高优先级生成队列',
                experimental: '优先体验新功能',
                commercial: '订阅期内生成的皮肤拥有永久商用许可'
            },
            pro_max: {
                title: 'Pro-Max',
                price: '20',
                quota: '每月额外获得 200 Credit 额度',
                collections: '支持创建私有收藏夹',
                private: '5,000 个私有皮肤上限',
                priority: '高优先级生成队列',
                experimental: '优先体验新功能',
                commercial: '订阅期内生成的皮肤拥有永久商用许可'
            }
        }
    },
    credits: {
        pageTitle: 'Credit 额度详情',
        pageDesc: '查看您的 Credit 额度增加和消费记录。',
        balanceLabel: '当前余额',
        topUpTitle: '购买 Credits',
        creditsFor: '{credits} Credits',
        paypalButton: '购买',
        waitingPayment: '等待支付完成...',
        purchaseSuccess: '充值成功！',
        purchaseSuccessMsg: '{credits} Credits 已添加到您的账户。',
        tableTime: '时间',
        tableType: '类型',
        tableSource: '来源 / 详情',
        tableAmount: '变动额度',
        loading: '正在读取记录...',
        empty: '暂无额度变动记录',
        prevPage: '上一页',
        nextPage: '下一页',
        pageInfo: '第 {page} 页 / 共 {total} 页',
        actionDailyLogin: '每日登录奖励',
        actionMonthlyLogin: '每月登录奖励',
        actionGeneration: '皮肤生成',
        actionRefund: '失败退款',
        actionSubscriptionGrant: '订阅赠送',
        actionPurchase: '充值购买',
    },
    modal: {
        payOrder: '支付订单',
        cancel: '取消',
        confirm: '确定',
        paySuccess: '支付成功',
        payFailed: '支付失败',
        loadingConfig: '加载配置中...',
        processingPayment: '支付处理中...',
        paypalProratedDifference: '由 PayPal 自动计算补收差价'
    },
    print: {
        title: '3D打印像素风收藏手办',
        description: '产品为 3D 打印高精白模 + 高清色彩还原贴纸，像素级复刻你的专属桌面摆件。',
        priceLabel: '统一售价',
        shippingLabel: '配送服务',
        freeShipping: '全球包邮',
        deliveryTime: '2-4 周可送达',
        trackingLabel: '快递跟踪',
        fullTracking: '全程可跟踪',
        realTimeUpdates: '物流实时更新',
        dimensionsLabel: '外形尺寸',
        modelMaterialLabel: '白模材质',
        modelMaterial: 'PLA、TPU',
        modelMaterialDesc: '高精度打印',
        stickerMaterialLabel: '贴纸材质',
        stickerMaterial: '影像级背胶防水纸',
        stickerMaterialDesc: '色彩准确 / 哑光质感',
        features: {
            articulated: { title: '灵活可动', desc: '多关节自由调节，轻松解锁无限动作' },
            precision: { title: '高精度打印', desc: '3D打印高精度白模，精细还原每个细节' },
            clarity: { title: '高清画质', desc: '高清材质背胶贴纸，像素细节分毫毕现' },
            color: { title: '色彩还原', desc: '高色彩饱和，使用影像级打印机和打印纸' }
        },
        discoverSkins: '发现皮肤',
        fromCollection: '从收藏中选择',
        uploadLocal: '上传本地皮肤',
        itemInfo: '商品信息',
        specs: '规格参数',
        type: '类型',
        shipTo: '配送至:',
        change: '修改',
        noAddress: '暂无地址，请添加',
        continue: '继续',
        uploadFailed: '上传定制模型文件失败',
        infoMissing: '模型信息丢失，请重试',
        selectAddress: '请选择收货地址',
        createFailed: '下单失败',
        modelNameLabel: '模型名称',
        materialLabel: '材质',
        materialDetail: '3D 打印底座(PLA)；3D 打印关节(TPU)；贴纸',
        dimensionsDetail: '约 50×12.5×100 mm',
        soldOutNotice: '抱歉，该模型当前已达产能上限，暂时无法下单 (不影响您已提交的订单)',
        ecoMaterial: '环保材质',
        oneToOne: '1:1 还原',
        whiteModelSticker: '白模+贴纸',
        soldOut: '该模型已售罄 / 产能全满 (明天再来尝试)',
        fileTooLarge: '文件太大，最大支持 512KB',
        ageWarning: '14+ 成人收藏摆件，非儿童玩具',
        promoLabels: {
            video: '视频演示',
            style1: '款式展示 1',
            style2: '款式展示 2',
            style3: '款式展示 3'
        },
        loginPrompt: '登录以使用 3D 打印功能',
    },
    address: {
        managerTitle: '收货地址管理',
        addAddress: '新增地址',
        editAddress: '修改地址',
        country: '国家',
        zipCode: '邮编',
        phone: '联系电话',
        state: '州/省',
        city: '城市',
        detailAddress: '详细地址',
        setDefault: '设为默认地址',
        save: '保存',
        addedCount: '已添加 {count}/10',
        addNew: '新增地址',
        noAddresses: '暂无地址',
        maxAddresses: '最多只能存储10个地址',
        fillAllFields: '请填写完整信息',
        saveFailed: '保存失败',
        confirmDelete: '确定删除该地址吗？'
    },
    terms: {
        title: '服务条款与隐私政策',
        intro: '欢迎使用我们的服务！在您开始体验前，请阅读我们的《服务条款》与《隐私政策》。',
        decline: '不同意并退出',
        agree: '同意并继续',
        tos: '服务条款',
        privacy: '隐私政策'
    },
    termsOfService: {
        title: 'EntropyDrop 服务条款',
        lastUpdatedLabel: '最后更新',
        lastUpdated: '2026年8月30日',
        sections: [
            {
                title: '1. 条款确认与服务范围',
                content: `本服务由上海齐秩科技有限公司（以下简称“EntropyDrop”“我们”或“平台”）运营。请您在注册账号、购买服务或使用 EntropyDrop 前认真阅读本条款，尤其是关于作品公开、知识产权、付费服务和责任限制的内容。

当您点击“同意并继续”、注册账号、购买服务或继续使用 EntropyDrop，即表示您已阅读、理解并同意本条款及《隐私政策》。若您不同意，请停止使用本服务。

“EntropyDrop 服务”包括 entropydrop.com 网站及其提供的 AI 图片、游戏角色皮肤和 3D 模型生成、编辑与转换，作品保存、展示、搜索、收藏、点赞和分享，论坛与社区，好友关系、Space 聊天、私信及其他社交功能，EntropyDrop Space 多人世界、世界编辑、可编程实体及资源市场，AI Agent、开发者 API、Credits、Pro 订阅、3D 打印定制实物，以及今后推出的其他相关功能。部分功能可能处于测试或实验阶段，并可能适用页面、API 文档或开发者控制台另行公布的规则。`
            },
            {
                title: '2. 使用资格与未成年人',
                content: `本服务原则上面向年满 14 周岁的用户。

未满 18 周岁的用户应当在父母或其他监护人同意和指导下阅读本条款、使用服务及进行消费。监护人应合理监督未成年人的使用时间、互动行为和付费行为。

我们不主动面向未满 14 周岁的儿童提供账号服务。若发现我们在未经合法监护人授权的情况下收集了儿童个人信息，我们将删除或采取其他必要保护措施。如果未来允许未满 14 周岁的儿童使用特定服务，我们将另行制定儿童个人信息保护规则并取得监护人同意。`
            },
            {
                title: '3. 账号与安全',
                content: `您目前可通过 Google 账号等平台支持的方式登录。您应当提供真实、准确并有权使用的信息，妥善保管登录凭据，不出租、出售、赠与或共享账号，不冒充他人、平台工作人员或其他组织，并在发现账号被盗用或出现异常活动时及时联系我们。

在允许的范围内，因您未妥善保护账号、主动共享凭据或使用不安全的第三方服务造成的损失，由您承担相应责任。`
            },
            {
                title: '4. AI 服务、AI Agent、API 与生成结果',
                content: `AI 生成结果具有随机性和不确定性。我们不保证生成结果完全准确、唯一、无错误或符合您的主观审美，不保证其一定能够获得知识产权保护，不保证不会与其他用户的结果相似，也不保证其适合特定商业、生产、安全或专业用途或能在任何第三方平台正常使用。

未来提供的 AI Agent 可能根据您的指令读取您选择提供的上下文，生成或执行代码，调用工具、API 或第三方服务，以及创建、修改、发布或删除内容和 Space 中的对象。Agent 可能误解指令、产生不准确结果或执行非预期操作。您应在授权前确认 Agent 的权限范围，并在执行付款、发布、删除、对外发送信息、修改重要数据或其他难以撤销的操作前复核并确认。使用您账号授权发起的 Agent 操作通常视为由您发起；我们可以对高风险工具增加二次确认、权限限制或暂停执行。

如果我们提供开发者 API，您应按照 API 文档使用并妥善保管 API 密钥。通过您的密钥发起的请求、用量和费用通常计入您的账号。您不得共享、公开、出售密钥，不得规避速率、配额或安全限制，也不得在未经书面许可的情况下转售、转接或以使第三方直接替代 EntropyDrop 服务的方式提供 API。我们可以基于安全、容量和公平使用需要设置或调整模型、速率、并发、配额、文件大小、上下文及其他技术限制，并可以升级或停止旧版 API；重大不兼容变更将尽可能提前通知。

您应在发布、销售、商业使用或依赖生成结果、Agent 输出或 API 输出前，自行检查其内容、技术可用性和权利状态。不得将其作为医疗、法律、金融、人身安全或其他高风险决定的唯一依据。对于涉及人物肖像、品牌、角色、建筑、艺术作品或其他第三方素材的内容，您应自行取得必要授权。`
            },
            {
                title: '5. Credits、订阅与虚拟物品',
                content: `Credits 是仅用于 EntropyDrop 内部指定功能的数字权益，不是货币，不具有现金价值，原则上不得转让、出售、兑换现金或在平台外交易。平台未来可能允许您使用 Credits 在 Space 市场购买虚拟物品、资源或相应使用权益。除购买页面另有说明外，取得虚拟物品仅代表获得在服务内按照展示规则使用该物品的有限权益，不代表取得相关知识产权或现实财产所有权；虚拟物品不得兑换现金或在平台外交易。

当生成任务因平台确认的技术故障而失败，或已扣除 Credits 的市场购买因平台原因未能交付时，我们可以退还相应 Credits。已经成功处理的生成任务或已正常交付的虚拟物品，除购买页面另有说明、平台存在系统性错误或适用规定另有要求外，已消耗的 Credits 通常不予退还。

Pro-Plus、Pro-Max 等订阅按购买页面所示周期自动续费，直至您主动取消。取消订阅后，权益通常持续到当前已付费周期结束，之后停止续费。除购买页面、支付服务商规则或强制性规定另有要求外，已经开始的计费周期通常不按未使用时间折算退款。

AI Agent 或 API 服务可以按照请求次数、输入输出量、计算时间、工具调用、存储、带宽或其他在购买页面及开发者控制台展示的计量方式收费。第三方工具或服务产生的费用可能由相应第三方另行收取。除计费错误、重复扣费、平台确认的服务故障或另有规定外，已经实际处理的 Agent 或 API 用量通常不予退还。

我们可以调整价格、额度或套餐内容。涉及续费价格或核心权益的重大调整，将在生效前以合理方式通知您。通过欺诈、支付撤销、漏洞利用或其他不正当方式获得的 Credits、订阅权益或虚拟资源，我们有权撤销。`
            },
            {
                title: '6. 生成作品的使用许可',
                content: `在您拥有相应权利的范围内，您保留对自行创作并上传内容的权利。上传内容不会使其所有权自动转移给 EntropyDrop。

免费方案下生成的作品适用 CC BY-NC 4.0。在 EntropyDrop 有权授予许可的范围内，生成者及其他用户均可在署名条件下将作品用于个人、学习、研究及其他非商业目的，并可复制、分享和修改；不得直接或间接用于商业销售、商业宣传、付费项目或其他营利活动。

在有效 Pro-Plus、Pro-Max 或页面明确标注具有商用许可的付费周期内生成、且不受上游非商业或未知许可限制的作品，生成该作品的账户获得永久、全球、非独占的商业使用许可。即使之后订阅到期，该期间已经取得的商用许可仍然有效。作品设为公开时，其他用户仅获得 CC BY-NC 4.0 非商业许可；公开展示、可查看或可下载不代表其他用户获得商业使用权。

编辑或再生成作品不得扩大来源作品的许可范围。以 CC BY-NC 4.0 作品为来源的编辑或再生成结果仍仅限非商业使用；以许可未知的旧上传作品为来源时，结果的许可同样记为未知。生成者编辑自己已经获得商用许可的作品，可以继续享有该商用许可；其他用户基于公开作品进行编辑或再生成时，仅能依照该作品向公众提供的非商业许可使用。

在保存独立创作或导入的皮肤前，界面将要求您确认拥有所选许可所需的权利。在界面提供许可选择时，有效 Pro 账户可以为该保存账户选择页面显示的 EntropyDrop 商用许可；该选择不会产生、清除或转移您原本不拥有的任何第三方权利。商用选项不可用或您选择 CC BY-NC 4.0 时，作品按非商业许可记录。无论生成者选择哪种许可，作品保存为公开后，其他用户均仅获得 CC BY-NC 4.0；生成者专属商用许可不会扩展给他人。保存为私有不会向新用户授予公开访问。许可记录功能启用前上传的皮肤标记为“许可未知”。CC BY-NC 4.0 许可一经有效授予即不可撤销；删除作品或转为私有不会撤销第三方此前已经合法取得的许可。

上述许可仅涵盖 EntropyDrop、上传者或其他许可人对相关内容能够授予的权利，不包括第三方商标、角色、肖像、版权素材或其他第三方权利。AI 输出是否受到知识产权保护可能因司法辖区、人工创作贡献和具体作品而异。

通过 AI Agent 或 API 产生的输出适用调用时对应套餐、API 文档或开发者控制台显示的使用许可；未另行说明时，与同一账号和付费层级下直接生成的同类输出适用相同规则。

由于 AI 技术特点，其他用户可能获得相同或相似结果。我们不会仅因您生成或使用某一结果而承诺向您授予排他性权利。`
            },
            {
                title: '7. 公开内容、私有内容与平台授权',
                content: `当您将作品设为“公开”时，其生成结果、提示词、源图片、处理中间结果、作者昵称、头像、模型参数及相关公开互动信息可能被任何人通过页面、分享链接或公开接口访问、展示或下载。请勿将包含身份证件、联系方式、私人照片、未成年人信息或其他敏感信息的内容设为公开。

对于公开内容，除作品详情页显示的用户间公共许可外，您还授予 EntropyDrop 一项全球范围、非独占、免许可费、可再许可的授权，以便我们存储、复制、转换和展示内容，提供搜索、分享、推荐、派生创作和社区功能，进行安全审查、内容审核和侵权处理，在合理范围内宣传服务，并对明确标注可用于模型改进的公开生成内容进行模型评估、微调或训练。作品的“公开”状态与生成者许可相互独立；详情页显示为生成者专属的商用许可不会因作品公开而扩展给其他用户。

当您删除公开内容或将其设为私有后，我们将停止将其用于新的公开展示和新的训练任务。但是，已经完成的模型训练可能无法从模型参数中单独分离或逆向移除该内容，第三方此前依据不可撤销的公共许可已经取得的权利也不受影响；另有强制要求的除外。

私信、仅限指定参与者的聊天及非公开好友信息也按私有内容处理。私有内容仅用于向您提供生成、存储、编辑、下载、消息投递、安全保护和必要技术支持。未经您的另行同意，我们不会公开展示私有内容、向您指定的接收者或参与者以外的其他普通用户提供私有内容，或将其用于模型微调或训练。为完成生成或消息投递、处理举报和安全事件、排查您主动提交的问题或履行必要义务，经过授权的工作人员及服务提供商可能在最小必要范围内处理私有内容。`
            },
            {
                title: '8. 社交功能、Space 多人世界与资源市场',
                content: `平台未来可能在主站或 Space 中提供好友请求、好友列表、屏蔽、Space 聊天、私信及其他社交功能。您应尊重其他用户选择，不得通过反复申请好友、发送消息或更换账号规避他人的拒绝或屏蔽。平台不保证其他用户身份、陈述或意图的真实性；如遇骚扰、诈骗、威胁或不当内容，请停止互动并使用屏蔽、举报或客服渠道。

Space 中的世界、频道、群组或附近聊天可能被相应范围内的其他参与者看到。私信原则上仅向您选择的接收者显示，但除非产品明确标注，否则“私信”不代表端到端加密。接收者可能保存、截图、转发或举报消息，因此请勿通过聊天或私信发送密码、API 密钥、支付凭据、身份证件、精确位置或其他不希望对方保存的信息。

Space 属于多人共享环境。其他玩家可能实时看到您的昵称、角色外观、位置、动作、世界编辑和公开资源。您对共享世界作出的地形或结构修改可能与其他玩家的修改合并。为了维持世界一致性、处理滥用事件和保护其他玩家的创作，部分已经进入共享世界的修改可能在您删除账号后以去标识化形式继续保留。

您发布到 Space 资源市场的方块集、实体、颜色集、脚本或其他资源，适用发布界面或资源详情页显示的许可和使用规则。我们可以为今后发布的资源调整可选许可或市场规则，但不会因此撤销其他用户此前已经依法取得的许可或使用权益。

Space 市场未来可能允许用户使用 Credits 获取虚拟物品、资源或相关使用权益。具体价格、功能、许可范围、可用期限、转让限制及其他条件以购买时的资源详情页为准。购买虚拟物品不转让发布者或其他权利人的知识产权。

您应确保发布的脚本和资源不包含恶意代码、后门、秘密收集信息的功能或侵犯第三方权利的内容。`
            },
            {
                title: '9. 社区行为与禁止事项',
                content: `您不得利用本服务实施以下行为：

• 发布违法、色情、剥削未成年人、恐怖、仇恨、严重暴力、欺诈或侵犯他人权利的内容；
• 骚扰、威胁、跟踪、侮辱、歧视或泄露他人私人信息；
• 批量或反复发送未经请求的好友申请、私信、广告、推广、钓鱼链接、诈骗信息或其他垃圾内容；
• 诱导、胁迫或欺骗未成年人提供敏感信息、私密内容、线下联系方式，或参与不适当的性相关互动；
• 未经授权使用他人的肖像、作品、商标、商业秘密或个人信息；
• 制作或传播作弊程序、外挂、恶意脚本、病毒或破坏性代码；
• 绕过身份验证、访问控制、内容限制、付费机制或安全措施；
• 未经授权访问、探测、攻击或干扰服务器、账号、网络或数据库；
• 利用机器人、爬虫、自动化脚本批量注册、刷量、囤积资源、异常调用接口或大量占用计算资源；
• 泄露、出售或滥用 API 密钥，规避 API 速率、配额、计费、权限或安全限制，或未经许可转售、转接 API；
• 利用 AI Agent 或 API 发送垃圾信息、操纵他人、自动实施欺诈、攻击、监控或其他未经授权的操作；
• 未经书面许可批量抓取、镜像、下载或重新分发平台数据、公开素材或模型；
• 冒充他人或以虚假方式误导用户；
• 利用服务从事其他严重损害平台及用户权益的活动。

依法进行的安全研究、明确允许的互操作行为以及平台明确以开源许可证开放的代码，不受不合理限制，但仍应遵守相应许可证及负责任披露规则。`
            },
            {
                title: '10. 内容管理与账号处理',
                content: `我们可以根据适用规则、用户举报及合理安全判断，对涉嫌违规内容采取降低曝光、限制互动、暂时隐藏、删除内容、撤销资源、限制部分功能、暂停或终止账号、保留必要证据等措施。

为了投递消息、过滤垃圾信息和恶意链接、处理举报、调查欺诈或安全事件以及履行必要义务，我们可以使用自动化系统，并由经过授权的人员在最小必要范围内审核相关账号、好友关系、聊天或私信内容。举报私信时，平台可能接收被举报消息、必要的上下文及相关账号信息。

对于紧急安全风险、明显违法内容、欺诈、攻击、作弊或大规模滥用，我们可以在不事先通知的情况下立即采取措施。如您认为处理有误，可通过 support@entropydrop.com 提出申诉。`
            },
            {
                title: '11. 定制实物商品',
                content: `EntropyDrop 提供的 3D 打印实物为“14+ 收藏摆件”，并非儿童玩具，不适合婴幼儿使用。

定制商品根据您选择或上传的模型制作。屏幕预览与实物之间可能因打印工艺、材料、贴纸、显示器色差和手工装配产生合理差异。定制商品在下单页面明确提示并由您单独确认后，可能不适用七日无理由退货。但是，商品存在严重质量问题、错发、漏发、物流破损或不符合订单约定的，您仍可要求修理、重做、更换、退货或退款。

商品进入制作阶段后，除另有规定或我们同意外，通常无法取消。页面显示的生产及配送时间属于预计时间，可能受目的地、海关、承运商和不可抗力影响。

购买实物使您取得该件实物的所有权，但不会使您取得其中所含第三方角色、图案或其他知识产权。您对涉及第三方权利的定制内容及转售行为承担相应责任。`
            },
            {
                title: '12. 第三方服务',
                content: `EntropyDrop 可能使用或链接 Google 登录、Google Analytics、AWS、PayPal、YouTube、物流服务商、基础模型提供商、工具或连接器提供商，以及用户自行选择的 AI 接口等第三方服务。

当您授权 AI Agent 调用第三方工具或连接外部账号时，Agent 可能向该第三方发送完成任务所需的指令、内容和上下文，并接收其返回结果。请在授权前查看权限范围和第三方规则，并仅连接您有权使用的账号和数据。

第三方服务由相应第三方独立提供，并适用其服务条款和隐私规则。因第三方服务本身的中断、限制、账号处理或政策变化造成的问题，我们将在合理范围内协助，但无法控制第三方行为。`
            },
            {
                title: '13. 服务变更与可用性',
                content: `我们可以因技术升级、安全、维护、合规、成本或业务调整而修改、暂停或终止部分服务。对于订阅核心权益、用户数据处理方式或服务整体终止等重大变化，我们将尽可能提前通知，并按适用要求提供必要的数据导出、退款或其他处理方案。

测试功能可能出现数据丢失、兼容性变化或随时下线，请勿将其作为唯一的关键生产环境。AI 模型、Agent 工具、API 字段、响应格式和版本也可能随服务演进而变化；我们会尽可能通过文档、版本号或迁移期管理重大不兼容变更。`
            },
            {
                title: '14. 免责声明',
                content: `在允许的范围内，本服务按“现状”和“可用状态”提供。我们不保证服务始终不中断、无错误或完全安全，也不保证 AI Agent 或 API 始终准确执行指令、持续兼容或完成每项任务。您应当自行备份重要作品、源文件和脚本，为 Agent 配置最小必要权限，并对重要操作保留人工复核和恢复措施。我们将采取合理措施保护数据，但无法承诺任何网络服务绝对不存在故障或安全风险。`
            },
            {
                title: '15. 责任范围',
                content: `任何责任限制均不适用于禁止限制的责任，包括因故意、重大过失、人身损害、欺诈或侵犯消费者法定权利产生的责任。

我们不会通过本条款排除或限制您依法享有的投诉、举报、调解、退款、诉讼或其他消费者权利。对于因您违反本条款、侵犯第三方权利或违法使用服务而产生的责任，由责任方依法承担。`
            },
            {
                title: '16. 账号终止与数据处理',
                content: `您可以停止使用服务，并通过 support@entropydrop.com 申请删除账号。

账号删除后，您将无法继续访问作品、Credits、订阅权益、Space 状态、虚拟物品和其他账号数据。必须保留的订单、支付、税务、安全和争议记录可能在必要期限内继续保留。

账号终止不影响终止前已经产生的付款义务、第三方已经依法取得的有效许可或使用权益、必要证据保存及其他按性质应继续有效的条款。`
            },
            {
                title: '17. 条款更新与联系我们',
                content: `我们可能因服务、业务或规则变化更新本条款。重大变更将通过站内提示、电子邮件或其他合理方式通知。对于需要重新取得同意的重大变更，我们会在变更生效前再次征求您的同意。

运营主体：上海齐秩科技有限公司
产品名称：EntropyDrop
网站：entropydrop.com
电子邮箱：support@entropydrop.com`
            }
        ]
    },
    privacyPolicy: {
        title: 'EntropyDrop 隐私政策',
        lastUpdatedLabel: '最后更新',
        lastUpdated: '2026年8月30日',
        sections: [
            {
                title: '1. 适用范围与处理者',
                content: `上海齐秩科技有限公司是 EntropyDrop 相关个人信息的处理者。我们遵循合法、正当、必要、诚信和最小化原则处理个人信息。

本政策适用于 EntropyDrop 网站、AI 生成服务、未来可能提供的 AI Agent 与开发者 API、好友、聊天、私信及其他社交功能、社区、Space、订阅、Credits 和定制商品服务。`
            },
            {
                title: '2. 我们收集的信息',
                content: `根据您使用的功能，我们可能处理以下信息：

• 浏览与访问：IP 地址、浏览器和设备类型、语言、页面访问、时间、网络及错误信息，用于加载页面、安全防护、限流、故障排查和服务优化；
• Google 登录：Google ID、电子邮箱、账号名称和头像，用于创建账号、身份验证、通知和账号管理；
• 个人资料：昵称、头像、游戏角色皮肤及角色模型类型，用于展示作者身份、社区资料和 Space 角色；
• AI 生成、编辑与许可：提示词、源图片、生成结果、中间结果、模型版本、参数、随机种子、公开状态、许可类型、许可版本、授权时间、商业许可对象、上传许可确认和反馈，用于完成生成、保存历史、展示及执行许可、记录授权、计费、故障恢复和模型改进；
• AI Agent 与 API：对话、指令、您选择提供的上下文、文件和对象、工具调用及返回结果、生成代码、执行或操作记录、API 密钥标识、请求与响应元数据、用量、配额、错误和审计日志，用于理解请求、执行任务、提供接口、计费、调试、安全审计和防止滥用；
• 社区：帖子、评论、图片、视频链接、收藏、点赞、举报和通知，用于提供社区互动、展示内容和处理违规；
• 好友与通信：好友申请、好友列表、屏蔽关系、发送者和接收者标识、聊天及私信内容和附件、所在 Space 或频道、发送、投递、阅读状态、时间、举报及审核记录，用于建立好友关系、投递和同步消息、提供屏蔽与举报功能、维护安全和防止滥用；
• Space：用户及玩家标识、世界标识、角色位置和状态、世界修改、公开资源、脚本、市场发布、购买、下载及虚拟物品权益记录，用于多人同步、断线恢复、保存世界、运营资源市场、交付虚拟物品和防止滥用；
• 订阅与 Credits：套餐、Credits 余额及变动、Credits 购买或兑换虚拟物品的记录、PayPal 订单号、订阅状态、支付金额和时间，用于完成支付、交付权益、续费、退款、对账和防欺诈；
• 定制实物：国家或地区、联系电话、邮编、省州、市、详细地址、定制模型、订单及物流状态，用于制作、配送、售后和履行必要义务；
• 分析信息：Cookie 或类似标识符、页面访问、交互事件、设备信息及大致地区，用于统计使用情况并改进产品；
• 客服：电子邮箱、咨询内容、附件和沟通时间，用于回复问题、处理投诉和售后。

如果您上传包含面部、身份证件、健康、精确位置、金融账户或未成年人信息的图片，该内容可能构成敏感个人信息。除非功能确有必要且您拥有合法权利，请勿上传此类内容。我们不会将上传照片用于人脸身份识别。`
            },
            {
                title: '3. 信息来源',
                content: `我们通过以下方式取得信息：

• 您注册、填写、上传、创作、购买或联系我们时主动提供；
• 您使用网站、API 或 Space 时由系统自动产生；
• Google、PayPal、物流服务商等第三方根据您的授权或交易向我们提供；
• 其他用户对您的内容进行点赞、评论、举报或互动时产生。`
            },
            {
                title: '4. 处理目的与依据',
                content: `我们仅在以下情形处理个人信息：为创建账号、建立好友关系、投递聊天或私信、完成生成、响应 API 请求、执行您授权的 Agent 任务、提供多人世界、履行订单或订阅合同所必需；已取得您的同意或单独同意；为履行必要义务；为保护用户、平台或公众的人身财产安全所必需；在允许的范围内，为网络安全、防欺诈、故障排查及合理产品改进所必需；或在合理范围内处理您自行公开或已经合法公开的信息。

您拒绝提供非必要信息不会影响基本功能；拒绝提供某项服务所必需的信息，可能导致相应功能无法使用。`
            },
            {
                title: '5. 公开内容与私有内容',
                content: `如果您选择“公开”，生成结果、源图片及处理中间结果，提示词、作品名称、模型参数、派生关系、许可类型及许可状态，昵称、头像、角色皮肤及生成者标识，以及公开收藏、点赞数量、论坛内容、面向世界或频道的 Space 聊天和 Space 市场资源可能向相应参与者或任何人公开。公开信息可能被其他用户查看、下载、截图、分享、建立链接或在平台外传播。即使您之后删除，第三方此前保存的副本也可能无法由我们控制，第三方此前已经合法取得的不可撤销许可也可能继续有效。

对于免费方案，生成内容通常只能以公开方式保存，并以 CC BY-NC 4.0 供任何人非商业使用。保存或导入皮肤时，我们会记录您的权利确认、所选生成者许可、适用的公共许可、确认时间及对应作品，以证明和管理许可。符合条件的 Pro 账户可以在界面提供时选择仅属于生成者的商用许可，但公开作品的其他用户仍仅获得 CC BY-NC 4.0；旧上传作品可能显示为“许可未知”。请在提交前检查界面上的公开状态和许可提示，不要上传不希望公开的个人照片、敏感内容或您无权许可的作品。在界面明确告知并取得相应授权后，我们可能使用公开生成内容、提示词及质量反馈进行模型评估、微调或训练。

私信、仅限指定参与者的聊天、非公开好友信息、AI Agent 对话、API 输入、您提供的上下文和通过工具取得的私有数据按私有内容处理。私有内容不会向您选择的接收者或参与者以外的普通用户公开，也不会用于模型微调或训练。我们仅为完成生成、响应 API 请求、执行您授权的 Agent 任务、投递消息、存储、编辑、安全保护、处理举报或您主动提交的问题及履行必要义务而访问私有内容，并实施权限控制。

私信的接收者可以保存、截图、转发或举报其收到的内容；当消息被举报时，被举报内容、必要上下文和相关账号信息可能提供给平台审核人员。除非产品明确标注，私信不代表端到端加密。`
            },
            {
                title: '6. Cookie、浏览器存储与分析工具',
                content: `我们使用受 HttpOnly 保护的 Cookie 保存可续期登录会话，并在 localStorage 保存短期访问令牌；我们也使用 localStorage、sessionStorage 和 IndexedDB 保存语言、界面和摄像机设置，Space 背包、调色板及未同步世界编辑，资源缓存和临时会话状态，以及 AI Agent 的接口地址、模型和上下文设置。

Space 的 API 密钥仅保存在当前页面会话中，不会持久写入 localStorage。使用自定义 AI 接口时，提示词、必要游戏上下文和 API 密钥会由浏览器直接发送给您选择的服务商，并适用该服务商的隐私政策。

网站在配置 Google Analytics 时可能使用其分析服务。我们将在要求的情况下先取得您的同意，并为您提供拒绝或撤回分析 Cookie 的方式。PayPal、Google 登录和 YouTube 嵌入内容也可能由相应第三方设置 Cookie 或类似标识符。`
            },
            {
                title: '7. 信息共享、委托处理与披露',
                content: `我们不会出售您的个人信息，也不会将其提供给第三方用于其独立的行为广告。

为提供服务，我们可能在最小必要范围内向以下接收方提供信息：Google，用于账号登录及网站分析；AWS，用于服务器、数据库、对象存储、内容分发和备份；PayPal，用于付款、订阅、退款、对账及防欺诈；YouTube，用于展示用户提交的公开视频；3D 打印、物流和配送服务商，用于制作及寄送定制商品；基础模型、AI 接口、工具或连接器提供商，用于处理您主动提交的请求或执行您授权的 Agent 任务；以及提供安全、审计、法律和必要技术支持的专业服务商。

Agent 仅应在您授权的权限范围内连接外部服务。完成任务所需的指令、内容、上下文和工具返回结果可能在 EntropyDrop 与相关第三方之间传输。您可以通过断开连接、撤销授权或调整 Agent 权限停止后续访问，但这不影响撤销前已经完成的处理。

当您发送好友申请、聊天或私信时，您的昵称、头像、账号标识、消息、附件及必要状态信息会提供给您选择或功能范围内的接收者。接收者对其自行保存或再次分享的信息承担相应责任。

我们也可能为响应有权机关的要求，处理欺诈、攻击、侵权或紧急安全事件，或在合并、重组及资产转让中进行必要披露，并要求接收方继续按照适用要求保护信息。

平台的公开财务页面如展示交易信息，将对姓名、邮箱和其他直接身份信息进行删除、遮盖或去标识化处理。`
            },
            {
                title: '8. 跨境处理',
                content: `由于 Google、AWS、PayPal、YouTube 及其他服务商可能在不同国家或地区运营，您的信息可能被传输或存储在您所在国家或地区以外。

我们将根据适用要求采取数据最小化、合同保护、安全评估、认证、标准合同或取得单独同意等必要措施，并在需要时告知境外接收方、处理目的、信息类型及用户行使权利的方式。`
            },
            {
                title: '9. 保存期限',
                content: `我们仅在实现本政策所述目的所需的最短期限内保存信息：

• 账号资料：账号存续期间；账号删除申请核验后，原则上在 30 日内从主要业务系统删除或匿名化；
• 生成记录及作品：保存至您主动删除或账号删除；公开缓存可能需要最多 30 日更新；
• AI Agent 对话、任务上下文和执行记录：保存至您删除相关任务、关闭相应历史记录或删除账号；安全、计费和审计所需记录可在必要期限内继续保留；
• API 请求元数据、用量和安全日志：通常不超过 6 个月；计费、退款、争议或防滥用所需记录按必要期限保留；
• 好友和屏蔽关系：保存至您解除关系、删除账号或相关功能终止；举报、安全和防止重复骚扰所需记录可在必要期限内继续保留；
• 聊天与私信：按照产品界面显示的期限保存，或保存至您删除消息、相关会话终止或账号删除；已经送达的消息可能仍保留在接收者账号中，举报证据及安全记录可在必要期限内继续保留；
• 系统备份：原则上在 90 日内循环覆盖；
• Space 玩家状态：保存至账号删除；共享世界修改可在去标识化后继续保留；
• Space 市场资源及虚拟物品记录：在资源上架、向购买者提供相应权益或维护交易完整性所需期间保存；删除账号后可移除发布者身份关联，必要的交易和权益记录可继续保留；
• 技术和安全日志：通常不超过 6 个月，另有必要要求或正在处理安全事件的除外；
• 收货地址：保存至您主动删除或账号删除；
• 订单、支付、退款和财务记录：按照税务、会计、消费者保护等必要期限保存；
• 客服记录：通常保存至问题解决后 3 个月，存在争议或其他必要情形的除外；
• 浏览器本地数据：保留在您的设备中，直至您清除网站数据或卸载相关应用。`
            },
            {
                title: '10. 数据安全',
                content: `我们采取与风险相适应的安全措施，包括传输加密、访问控制、私有与公开存储隔离、权限最小化、日志监控、备份、安全更新和员工保密管理。

任何互联网服务都无法保证绝对安全。如发生可能影响您权益的个人信息泄露、篡改或丢失，我们将采取补救措施，并按适用要求通知受影响用户及有关机构。`
            },
            {
                title: '11. 您的权利',
                content: `在适用范围内，您可以查询、复制或导出个人信息，更正或补充不准确的信息，管理好友、解除好友关系或屏蔽其他用户，删除产品支持删除的消息、作品、地址或账号，修改作品的公开状态，撤回同意，限制或拒绝特定处理，注销账号，要求说明个人信息处理规则，或对账号、内容及隐私处理决定提出申诉。

撤回同意不影响撤回前处理行为的有效性。您可通过产品内功能或发送邮件至 support@entropydrop.com 行使权利。为保护账号安全，我们可能要求进行合理身份验证。`
            },
            {
                title: '12. 未成年人信息',
                content: `我们不主动面向未满 14 周岁的儿童提供账号服务。如果您是 14 周岁以上但未满 18 周岁的未成年人，请在监护人同意和指导下使用服务。监护人可以联系我们查询、更正或删除未成年人的信息。

如我们发现未经合法授权收集了未满 14 周岁儿童的信息，将尽快停止处理并删除。`
            },
            {
                title: '13. 政策更新与联系我们',
                content: `我们可能因功能、服务商或规则变化更新本政策。重大变化将通过站内通知、电子邮件或其他显著方式告知。涉及新增处理目的、敏感个人信息、公开展示、模型训练或跨境提供等需要重新取得同意的事项时，我们将重新征求同意。

个人信息处理者：上海齐秩科技有限公司
产品名称：EntropyDrop
网站：entropydrop.com
电子邮箱：support@entropydrop.com`
            }
        ]
    },
    mcmodal: {
        previewUnavailable: '无法预览',
        editName: '编辑名称',
        noName: '无名称',
        author: '作者',
        relatedCollections: '相关收藏',
        derivedFrom: '派生于',
        originalSkinDeleted: '原版皮肤已删除',
        derived: '派生',
        allDerived: '所有派生',
        model: '模型',
        seed: '随机种子',
        guidance: '引导系数',
        steps: '推理步数',
        id: 'ID',
        created: '创建时间',
        report: '举报',
        reportTitle: '举报此内容',
        reportSuccess: '举报已提交，我们会尽快核实',
        reasons: ['不适当内容', '抄袭/侵权', '垃圾广告', '其他'],
        reportEmailSubject: '内容举报',
        loginToSeeMore: '登录后查看更多详情',
        saveToCollection: '保存到收藏夹',
        public: '公开',
        private: '私有',
        noCollection: '无对应收藏夹',
        createCollection: '创建收藏夹',
        confirm: '确认',
        saving: '保存中...',
        favorite: '收藏',
        share: '分享',
        notFound: '该皮肤不存在或已删除',
        linkCopied: '链接已复制到剪贴板',
        privateWarning: '私有图片禁止收藏到公开的收藏夹',
        noPublicItems: '无公开项目',
        loading: '加载中...',
        slimMode: '纤细型',
        strongMode: '标准型',
        feedbackTitle: '生成质量反馈',
        feedbackGood: '效果很好',
        feedbackBad: '有瑕疵',
        feedbackThanks: '感谢反馈！已记录数据用于优化模型。',
        discordPrompt: '想要详细吐槽或提供建议？加入我们的',
        discordLinkText: 'Discord 社区',
        setMyCharacter: '设为自己的形象',
        settingMyCharacter: '设置中...',
        setMyCharacterSuccess: '设置成功！',
        setMyCharacterFailed: '设置失败',
        setMyCharacterNetworkError: '网络错误，请稍后重试',
        setMyCharacterRequirement: '只有你创建的公开皮肤才能设为自己的角色。',
        licenseTitle: '使用许可',
        licenseUnknown: '许可未知',
        licenseUnknownDescription: '该作品是许可系统启用前上传的内容，平台无法确认其授权范围。使用前请联系上传者确认。',
        creatorCommercialLicense: '生成者永久商用',
        creatorCommercialDescription: '您是该作品的生成者，并拥有永久、全球、非独占的商业使用许可。',
        publicNonCommercialDescription: '任何人均可按照 CC BY-NC 4.0，在署名条件下用于非商业目的、分享和修改。',
        privateLicenseDescription: '该作品当前为私有内容，未向其他用户提供新的公共访问。',
        publicDoesNotGrantCommercial: '您的商用许可仅属于生成账户；公开展示不会向其他用户授予商用权。',
        otherUserNoCommercial: '您仅获得 CC BY-NC 4.0 非商业许可；公开可见或可下载不代表获得商用权。',
        previousPublicLicense: '该作品曾经公开；此前已合法取得的 CC BY-NC 4.0 许可不因转为私有而撤销。',
        viewLicenseTerms: '查看 CC BY-NC 4.0 完整条款',
        thirdPartyRightsNotice: '许可仅覆盖许可人有权授予的权利，不包括第三方商标、角色、肖像、版权素材或其他第三方权利。'
    },
    space_page: {
        title: 'EntropyDrop Space',
        eyebrow: '可游玩原型',
        platform: 'WebGL 2 · 体素物理 · 环面拓扑',
        tagline: 'AI 辅助建造与自动控制的体素物理世界',
        description: '在无边界的环面甜甜圈几何世界中自由雕刻体素，一键将结构实体化为物理刚体。借助 AI 辅助快速建造复杂结构与机械，挂载 AI 智能体实现全自动动力巡航与行为控制，在现代浏览器中开启高自由度的体素物理创造实验。',
        primaryCta: '进入 Space 世界',
        offlineCta: '离线模式',
        secondaryCta: '核心特性',
        stats: {
            scale: '0.2m 精细微雕',
            physics: '体素物理引擎',
            programmable: 'AI 辅助建造 & 自动控制',
            torus: '环面无边几何'
        },
        heroPreview: {
            title: 'Space 实时运行视口',
            badge: 'LIVE VIEWPORT',
            status: 'STANDBY // 60 FPS'
        },
        featuresTitle: '核心机制与玩法系统',
        featuresSubtitle: '从 0.2m 微体素精细微雕到刚体物理动力学与 AI 辅助建造及自动控制，打造高自由度的物理沙盒。',
        features: [
            {
                tag: '0.2m 双尺度微雕',
                title: '双尺度精细体素雕刻',
                description: '标准方块（1.0m）快速构建大尺度地形，勺子工具无损切换至 0.2m 微体素（1/125 体积），搭配 24 位全彩调色盘打造极致机械与雕塑细节。',
                badge: '1.0m / 0.2m // 全彩',
                placeholderTitle: '双尺度体素微雕与调色盘截图'
            },
            {
                tag: '体素物理引擎',
                title: '一键实体化与体素物理',
                description: '框选任意连通体素结构按 G 键一键实体化为物理刚体，自动计算质心与惯性张量，支持动力学驱动、重力力矩与高频物理碰撞模拟。',
                badge: 'RigidBody // G 键',
                placeholderTitle: '框选实体化刚体与物理碰撞截图'
            },
            {
                tag: 'AI 辅助建造 & 自动控制',
                title: 'AI 辅助建造与自主运动控制',
                description: '通过 AI 快速辅助生成与建造复杂体素机械，对准实体按 C 呼出终端即可用自然语言下达自主悬停、寻路伴飞、姿态平衡等全自动控制指令，秒级驱动智能造物。',
                badge: 'AI 建造 & 自动驾驶 // C 键',
                placeholderTitle: 'AI 辅助建造与自动控制终端截图'
            },
            {
                tag: '无界几何',
                title: '环面拓扑与无界漫游',
                description: '基于环面（Torus，甜甜圈形状）几何打造的无边界宇宙，无任何空气墙阻隔，向任意方向全速漫游都将自然折跃循环相连。',
                badge: 'Torus Topology // 甜甜圈',
                placeholderTitle: '无缝环面宇宙与弯曲视效截图'
            }
        ],
        agentDevTitle: '核心技术与创作者生态',
        agentDevSubtitle: '结合安全脚本沙箱、实时体素物理与内置资源市场，构建高自由度可编程世界。',
        agentDevCards: [
            {
                icon: 'pixelarticons:code',
                title: 'AI 智能体控制与 QuickJS 实时沙箱',
                desc: '通过 AI 将建造构想与控制意图即时转化为精确动力学逻辑，在独立的 QuickJS WebAssembly 隔离沙箱中零延迟实时驱动推进器、转向轴与传感器反馈。'
            },
            {
                icon: 'pixelarticons:sliders',
                title: '实时体素物理与刚体动力学',
                desc: '实时求解连通体素拓扑的质量、质心与惯性张量，支持动力学推力推进、转向驱动、重力力矩与高频碰撞解算。'
            },
            {
                icon: 'pixelarticons:folder',
                title: 'Space 资源市场与蓝图共享',
                desc: '内置去中心化资源市场，支持一键发布与下载可编程刚体实体、微体素方块组与调色盘资产，实现创作者造物的即时跨世界复用。'
            }
        ],
        closingTitle: '无限创意的体素宇宙，已经就绪。',
        closingSubtitle: '无需下载任何安装包，在现代桌面浏览器中即刻开启 WebGL 2 体素物理世界体验。',
        communityLinks: {
            github: 'GitHub 仓库',
            discord: 'Discord 社区'
        }
    },
    public_page: {
        title: '开放生产体系',
        introduction: {
            title: '关于我们',
            company: '上海齐秩科技有限公司',
            desc: '致力于构建根信任基础设施与开放生产体系'
        },
        vision: {
            title: '我们的愿景',
            content: '我们的愿景是构建一套可验证、可审计、可共同治理的开放生产体系——从代码、算法到自动化产线，从决策过程到财务与资产，消除每一个黑盒。通过去中心化决策协议，社区将共同参与平台的长期演进。这一切的动机非常简单：生命以负熵为食。',
            moreLabel: 'More',
        },
        roadmap: {
            title: '开源演变路线',
            activeStatuses: ['进行中', 'Active'],
            developmentStatuses: ['开发中', 'In Development'],
            modules: [
                {
                    title: '软件 (Software)',
                    icon: 'pixelarticons:code',
                    items: [
                        { title: '系统架构', desc: '架构设计，涵盖前端、后端与 AI 推理架构的系统性协同设计。', status: '进行中', link: 'https://github.com/EntropyDrop' },
                        { title: '算法、模型、数据集', desc: '公开模型权重、训练方法、数据集及数据处理全流程。', status: '进行中', link: 'https://huggingface.co/EntropyDrop' },
                        { title: '决策协议', desc: '基于拜占庭容错的去中心化决策协议，保障所有决策细则公开，为社区共同治理奠定基础。', status: '开发中' }
                    ]
                },
                {
                    title: '硬件 (Hardware)',
                    icon: 'pixelarticons:device-laptop',
                    items: [
                        { title: '3D打印产线', desc: '从参数化设计、智能切片、自动供料、无人化运维到自动化后处理，构建智能的 3D 打印工厂。', status: '规划中' },
                        { title: '工业自动化', desc: '基于仿真和强化学习，驱动多智能体协作，打造完全自主的 AI 原生制造单元。', status: '规划中' },
                        { title: '可信设备', desc: '基于可信执行环境与开放硬件，确保数据使用、算法执行与生产过程可验证、可审计，并支持社区治理。', status: '规划中' }
                    ]
                },
                {
                    title: '财产 (Assets)',
                    icon: 'pixelarticons:briefcase',
                    items: [
                        { title: '财务状况', desc: '平台营收流、运营支出、资金流向及总资产的概览。', status: '开发中' },
                        { title: '固定资产', desc: '计算节点、实物加工设备及资产列表。', status: '开发中' },
                        { title: '实时总账', desc: '平台所有财务收支流水的实时、脱敏流展示。', status: '进行中', link: '/public/ledger' }
                    ]
                }
            ]
        },
        articles: {
            title: '最新动态',
            description: '阅读来自 EntropyDrop 的最新动态、研究、架构深度剖析和开发日志。',
            list: [
                { id: 'skin-reconstruction', title: '图生皮肤的新路径：从规范化渲染到 Minecraft UV 重建', date: '2026-07-25', tags: ['Minecraft', '计算机视觉', '几何重建', '生成模型'], summary: '将图片转皮肤拆分为规范化前后视图、确定性前景提取、固定视角几何拟合、Dense UV Parser 语义路由、原色取样与拓扑补全，并介绍如何积累数据，最终训练完全不依赖闭源模型的图生皮肤方案。' },
                { id: 'architecture', title: 'EntropyDrop 后端运行时架构与弹性伸缩边界', date: '2026-05-22', tags: ['架构', '后端', '扩展性'], summary: '基于当前后端代码与 AWS 部署脚本，说明 API readiness、连接池、ECS Service Auto Scaling、singleton 后台服务、一次性迁移任务，以及 GPU/RQ worker 仍未自动伸缩的真实边界。' },
                { id: 'skingen', title: '从参考图到 Minecraft 皮肤：生成模型训练实践', date: '2026-05-12', tags: ['LoRA', '微调', '数据集', '开源'], summary: '基于 Flux2 Klein 4B 基础模型，梳理从参考图生成可用 Minecraft 皮肤的完整微调训练实践，涵盖皮肤结构解析、高质量 Control-Target 数据集构建、LoRA 训练配置以及 Alpha Marker 透明通道后处理提取技术。' },
                { id: 'root-trust-governance', title: '根信任治理范式', date: '2026-04-29', tags: ['治理', '根信任'], summary: 'EntropyDrop 以去中心化决策协议为根信任底座，将代码、数据、算法、资产与生产过程纳入可验证、可审计、可共同治理的开放生产体系。' }
            ]
        },
        assets_pages: {
            financials: {
                title: '财务透明化',
                desc: '平台财务状况、可持续性指标及社会影响力赋能的综合视图。',
                source: '数据来源：实时总账',
                empty: {
                    value: '—',
                    financials: '暂无可验证财务数据',
                    breakdown: '暂无可聚合记录'
                },
                stats: {
                    revenue: '总营收',
                    expenditure: '总支出',
                    net_profit: '净利润',
                    runway: '预计生存周期',
                    burn_rate: '月烧钱率',
                    margin: '利润率'
                },
                charts: {
                    trend: '营收与支出趋势对比',
                    revenue_breakdown: '营收构成',
                    expenditure_breakdown: '支出构成'
                }
            },
            fixed_assets: {
                title: '固定资产披露',
                desc: '公开驱动 EntropyDrop 生态系统的物理及计算基础设施账目。',
                records: '条记录',
                empty: '暂无已公开且可验证的固定资产记录',
                source: '数据来源：固定资产总账待接入',
                categories: {
                    compute: '计算节点',
                    hardware: '生产加工设备',
                    infrastructure: '办公与网络设施'
                },
                list_headers: {
                    item: '资产名称',
                    type: '类别',
                    status: '状态',
                    value: '预估价值'
                }
            },
            ledger: {
                title: '实时总账',
                desc: '展示每个同步周期内来自 PayPal 与 AWS API 的收入和云服务账单记录，所有用户与交易敏感信息已脱敏。',
                fullData: '完整财务账单及数据集可在 GitHub 访问',
                fullDataUrl: 'https://github.com/EntropyDrop/financial',
                bankLedger: '银行实时总账正在开发中',
                betaNotice: '目前处于测试阶段，数据可能不准确',
                headers: {
                    date: '日期',
                    type: '类型',
                    source: '来源',
                    desc: '说明',
                    amount: '金额',
                    status: '状态'
                },
                stats: {
                    net: '净流入',
                    paypal: 'PayPal 账单',
                    aws: 'AWS 账单',
                    sync: '同步机制'
                },
                filters: {
                    all: '全部流水',
                    paypal: 'PayPal',
                    aws: 'AWS'
                },
                sync: {
                    daily: 'API 同步',
                    rateLimit: '受第三方 API 频率限制，更新周期暂时为每日',
                    lastUpdate: '最近同步',
                    records: '记录数',
                    empty: '暂无同步账单'
                }
            }
        }
    },
    discovery: {
        searchPlaceholder: '搜索皮肤名称...',
        searchResult: '搜索结果',
        searching: '搜索中...',
        noResults: '未找到结果',
        prev: '上一页',
        next: '下一页',
        rateLimitTitle: '请求过于频繁',
        rateLimitMessage: '请等待1秒后再搜索',
        searchMinLengthWarning: '搜索关键词长度至少为 1 个字符',
        modeList: '列表模式',
        mode3D: '3D 模式',
        sortByLikes: '最受欢迎',
        sortByTime: '最新发布',
        modelSeries: '模型系列',
        allModelSeries: '全部系列'
    },
    monitor: {
        adminAccessRequired: '需要管理员权限',
        failedFetchStats: '获取统计数据失败',
        connectionError: '连接错误',
        liveSystemStatus: '实时系统状态 • 上次同步：',
        systemOnline: '系统在线',
        globalSettingsTitle: '全局系统设置 • 活动控制',
        globalSettingsDesc: '一键控制所有用户的生成额度限制。开启后，生成将不消耗额度且无任何限制。',
        unlimitedQuotaActive: '全局不限量已开启',
        standardLimitsActive: '标准额度检查中',
        textToSkinToggleTitle: '文生皮肤功能维护开关',
        textToSkinToggleDesc: '控制 Generate 页面的 Text to skin（文生皮肤）按钮是否可用。开启维护时按钮将不可用。',
        imageToSkinToggleTitle: '图生皮肤功能维护开关',
        imageToSkinToggleDesc: '控制 Generate 页面的 Image to skin（图生皮肤）按钮是否可用。开启维护时按钮将不可用。',
        imageEditToSkinToggleTitle: '编辑生皮肤功能维护开关',
        imageEditToSkinToggleDesc: '控制 Generate 页面的 Image Edit to skin（编辑生皮肤）按钮是否可用。开启维护时按钮将不可用。',
        enabled: '功能已开启',
        disabled: '功能已关闭',
        underMaintenance: '维护中',
        operational: '正常运行',
        unlimitedEnabledMsg: '全局不限量生成额度功能已成功开启！',
        unlimitedDisabledMsg: '全局生成额度不限量已关闭，已恢复正常额度检查。',
        textToSkinEnabledMsg: '文生皮肤功能已开启',
        textToSkinDisabledMsg: '文生皮肤维护模式已开启，用户将无法使用该功能。',
        imageToSkinEnabledMsg: '图生皮肤功能已开启',
        imageToSkinDisabledMsg: '图生皮肤维护模式已开启，用户将无法使用该功能。',
        imageEditToSkinEnabledMsg: '编辑生皮肤功能已开启',
        imageEditToSkinDisabledMsg: '编辑生皮肤维护模式已开启，用户将无法使用该功能。',
        operationFailed: '操作失败，请重试',
        networkError: '网络连接错误',
        deleteSkinSuccess: '成功删除皮肤 {id} 及其相关资源。',
        deleteSkinFailed: '删除失败：',
        deleteUserSuccess: '成功彻底删除邮箱为 {email} 的账号及其所有关联数据。',
        deleteUserFailed: '删除账号失败：',
        statusQueued: '排队中',
        statusProcessing: '生成中',
        statusFailed: '失败',
        modeTextToImage: 'AI 文生图',
        modeImageToImage: 'AI 图生图',
        modeImageEdit: 'AI 局部编辑',
        modeImageToSkin: 'AI 图生皮肤',
        modeTextToSkin: 'AI 文生皮肤',
        modeEditToSkin: 'AI 编辑生皮肤',
        modeHumanEdit: '人类编辑',
        modeHumanUpload: '人类上传',
        systemMaintenanceMsg: '该功能正在系统维护中，请稍后再试。',
        temporarilyUnavailable: '系统维护中'
    }
} as const
