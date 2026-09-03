export default {
    lang: 'en',
    title: 'EntropyDrop',
    subtitle: 'Open-Source Manufacturer',
    fontClass: 'font-pixel-hans',
    nav: {
        discover: 'Discover',
        generate: 'Generate',
        edit: 'Edit',
        print: '3D Print',
        collection: 'Collections',
        pro: 'Pro',
        public: 'Public',
        about: 'About Us',
        blog: 'Blog',
        monitor: 'Monitor',
        skin: 'Skins',
        space: 'Space',
        figure: 'Figures',
        discussions: 'Discussions',
        showcase: 'Showcase',
        videos: 'Videos'
    },
    figureForum: {
        title: '3D Figure Forum',
        subtitle: 'Share, discuss, and showcase 3D printed pixel-style figures.',
        publishPost: 'Publish Post',
        activeMembers: 'Active Members',
        totalPosts: 'Total Posts',
        totalPrints: 'Total Prints',
        postTitle: 'Title',
        postContent: 'Content',
        postCategory: 'Category',
        postTags: 'Tags (comma separated)',
        postSettings: '3D Print Settings',
        layerHeight: 'Layer Height',
        infill: 'Infill',
        printerModel: 'Printer Model',
        printTime: 'Print Time',
        submitPost: 'Submit Post',
        cancel: 'Cancel',
        comments: 'Comments',
        writeComment: 'Write a comment...',
        commentBtn: 'Comment',
        printSettingsTitle: 'Print Settings',
        orderPrint: 'Order 3D Print',
        views: 'views',
        likes: 'likes',
        commentsCount: 'comments',
        hours: 'hours',
        material: 'Material',
        bodyTypes: ['SLA', 'FDM', 'UV Inkjet 3D Printing', 'Other/Unknown'],
        colorModes: ['Stickers', 'UV Inkjet', 'Spraying', 'FDM Multi-color', 'Other/Unknown'],
        deleteVideo: 'Delete Video',
        confirmDeleteVideo: 'Are you sure you want to delete this video?',
        deletePost: 'Delete Post',
        confirmDeletePost: 'Are you sure you want to delete this post?',
        changePostType: 'Change Post Type',
        changePostTypePrompt: 'Select the category for this post:',
        backToVideos: 'Back to Videos',
        addNewVideo: 'Add New Video',
        youtubeUrlLabel: 'YouTube Link or Video ID',
        publishVideo: 'Publish Video',
        searchVideosPlaceholder: 'Search videos...',
        searchDiscussionsPlaceholder: 'Search discussions...',
        searchBtn: 'Search',
        addVideoBtn: 'Add Video',
        bodyTypeLabel: 'Body Type:',
        colorModeLabel: 'Color Mode:',
        bodyTypeSelect: 'Body Type',
        colorModeSelect: 'Color Mode',
        forumPageLabel: 'Page {page} of {total}',
        showcaseImgWarning: 'Showcase posts must contain at least one image!',
        backToForum: 'Back to Forum',
        postedBy: 'Posted by',
        noComments: 'No comments yet. Be the first to reply!',
        noDiscussions: 'No discussions found.',
        noShowcases: 'No showcase posts found.',
    },
    generate: {
        imageMode: 'Image Mode',
        textMode: 'Text Mode',
        uploadTitle: 'Upload Reference',
        uploadHint: 'Supports PNG and JPG',
        fileTooLarge: 'Unable to optimize this image for upload',
        textPlaceholder: 'e.g. A character in blue...',
        imageEditTextPlaceholder: 'e.g. Change the clothes to red...',
        textTitle: 'Prompt',
        btnStart: 'Generate Now',
        btnGenerating: 'Building...',
        emptyTitle: 'Ready to Create?',
        generatingTitle: 'Generating Magic...',
        btnDownload: 'Download',
        btnSave: 'Save',
        historyTitle: 'History',
        historyEmpty: 'No records',
        private: 'Private',
        public: 'Public',
        visibility: 'Visibility',
        privateTip: 'Available for Pro',
        generationFailed: 'Generation failed: ',
        notice: 'Notice',
        pleaseUploadImage: 'Please upload an image',
        pleaseEnterDesc: 'Please enter a description',
        guidanceWarning: 'Guidance must be between 0.1 and 15',
        stepsWarning: 'Inference steps must be between 20 and 120',
        seedWarning: 'Seed must be between 0 and 100,000,000',
        serverError: 'Server Error',
        failedGetTaskId: 'Failed to retrieve Task ID',
        submitSuccess: 'Submitted',
        submitSuccessMsg: 'Task submitted successfully! Check progress in the history.',
        submitFailed: 'Failed',
        submitFailedMsg: 'Submission failed: ',
        loginPrompt: 'Login to use generation features',
        statusPending: 'Pending',
        statusProcessing: 'Generating Base',
        statusPendingSkin: 'Pending (Skin Gen)',
        statusProcessingSkin: 'Generating Skin',
        statusFailed: 'Failed',
        imageUploadDesc: 'Image Upload',
        noPrompt: 'No Prompt',
        modeLabel: 'Mode',
        unlockAndClear: 'Unlock & Clear',
        lockedSource: 'Locked Source',
        clickReupload: 'Click to Re-upload',
        advancedSettings: 'Advanced Settings',
        modelVersion: 'Model Version',
        inferenceSteps: 'Inference Steps',
        default: 'Default',
        guidanceScale: 'Guidance Scale',
        seed: 'Seed',
        random: 'Random',
        privateWarning: 'Private model remains private',
        publicWarning: 'Generated skins from public must be public',
        ok: 'OK',
        dailyQuota: 'Daily Quota',
        remainingQuota: 'Credits: ',
        quotaExceeded: 'Insufficient credits',
        proTag: 'Pro',
        loadingModels: 'Loading...',
        btnLoadingModel: 'Loading model...',
        btnSubscribePro: 'Subscribe for PRO Model',
        proModelTitle: 'PRO Exclusive Model',
        proModelDesc: 'The selected model is exclusive to PRO members. Please subscribe to use it.'
    },
    collection: {
        title: 'My Collections',
        subtitle: 'Manage every block of inspiration',
        btnNew: 'New Collection',
        typeCollection: 'Collection',
        labelDefault: 'Original Creations',
        labelPublic: 'Custom Collections (Public)',
        labelPrivate: 'Custom Collections (Private)',
        labelCustom: 'Custom Collections',
        uploadFailed: 'Upload failed',
        fileTooLarge: 'File too large, max support 512KB',
        moveFailed: 'Move failed',
        renameFailed: 'Failed to rename',
        confirmDelete: 'Delete this collection? Items inside won\'t be deleted. To delete source files, please visit "Original Creations".',
        confirmDeleteTitle: 'Confirm Delete',
        confirmRemoveLike: 'Remove like?',
        confirmRemove: 'Confirm Remove',
        confirmPermanentDelete: 'Deleting from here will permanently delete the skin and all its collection links. Are you sure?',
        confirmRemoveShortcut: 'Remove shortcut from this collection only? Original files won\'t be deleted. To delete source files, visit "Original Creations". Continue?',
        loginPrompt: 'Please login to view and manage collections',
        publicCollection: 'Public Collection',
        myLikes: 'Liked Items',
        creationsPublic: 'Creations (Public)',
        creationsPrivate: 'Creations (Private)',
        share: 'Share',
        upload: 'Upload Skin',
        uploadDestination: 'Choose a destination collection',
        chooseImage: 'Choose image',
        previousPage: 'Previous page',
        nextPage: 'Next page',
        uploadLicenseTitle: 'Confirm Upload License',
        uploadLicenseMessage: 'By uploading, you confirm that you hold the rights needed to grant this license and agree to offer the skin under CC BY-NC 4.0. Anyone may use, share, and adapt it for non-commercial purposes with attribution. This license is irrevocable; making the skin private limits new access but does not withdraw licenses already validly received.',
        empty: 'It\'s empty here',
        create: 'Create Collection',
        name: 'Name',
        visibility: 'Visibility',
        public: 'Public',
        private: 'Private',
        btnCreate: 'Create',
        rename: 'Rename Collection',
        btnRename: 'Rename',
        btnDelete: 'Delete',
        enterNewName: 'Enter new name...',
        enterName: 'Enter collection name...',
        uploadNotSupported: 'Direct upload not supported. Please upload in "Original Creations".',
        linkCopied: 'Link copied to clipboard',
        moveToCollection: 'Move to Collection',
        noCollectionAvailable: 'No collection available',
        filterName: 'Filter by name',
        filterType: 'Filter by type',
        allTypes: 'All Types',
        modeTextToSkin: 'AI Text To Skin',
        modeImageToSkin: 'AI Image To Skin',
        modeImageEditToSkin: 'AI Image Edit & Re-generation',
        modeHumanEdit: 'Human Edited',
        modeHumanUpload: 'Human Uploaded',
        search: 'Search',
        btnGenerate: 'AI Generate Skin',
        confirmMakePrivate: 'Are you sure you want to make this public creation private? (Pro only)',
        makePrivateTitle: 'Make Private',
        makePrivatePro: 'Make Private (Pro)',
        privateQuotaExceeded: 'Free users have no private quota, please subscribe to Pro',
        deleteQuotaExceededTitle: 'Quota Reached',
        deleteQuotaExceeded: 'Free users can only delete 1 skin per day. Please subscribe to Pro for unlimited deletions.',
        freeDeleteWarning: '\n\n(Note: Free users can only delete 1 skin per day. Pro is unlimited)'
    },
    edit: {
        importTitle: 'Import Skin Model',
        importDesc: 'Import a PNG image with skin texture (64x64) to start your creation.',
        overlay: 'Overlay',
        pencil: 'Pencil',
        eraser: 'Eraser',
        colorPicker: 'Color Picker',
        undo: 'Undo',
        redo: 'Redo',
        import: 'Import',
        export: 'Download',
        collect: 'Save',
        saveToCreations: 'Save to Original Creations',
        saveAsPublic: 'Save as Public',
        saveAsPrivate: 'Save as Private',
        saving: 'Saving...',
        privateModelWarning: 'Private model remains private',
        exitReference: 'Exit Reference Model',
        saveSuccess: 'Saved to creations',
        saveFailed: 'Failed to save',
        saveLicenseTitle: 'License after saving',
        saveLicenseChoose: 'Choose the saved license',
        saveLicenseCommercial: 'Creator commercial license',
        saveLicenseCommercialOption: 'Commercial',
        saveLicenseCommercialDescription: 'This edit keeps your perpetual commercial-use license. If saved as Public, other users receive only CC BY-NC 4.0.',
        saveLicenseCommercialNewDescription: 'By saving, you confirm that you hold the necessary commercial rights. The commercial license applies only to your account; a Public save gives other users only CC BY-NC 4.0.',
        saveLicenseNonCommercialDescription: 'By saving, you confirm you hold the necessary rights and agree to record this edit under CC BY-NC 4.0. A Public save lets anyone reuse it non-commercially with attribution.',
        saveLicenseUnknown: 'Unknown license',
        saveLicenseUnknownDescription: 'Editing does not expand unknown source rights. A Public save does not grant other users reuse rights.',
        saveLicenseLoading: 'Checking license...',
        saveLicenseLoadingDescription: 'Checking the source skin before showing the license that will be saved.',
        saveLicenseUnavailable: 'License unavailable',
        saveLicenseUnavailableDescription: 'The source license could not be verified. Reopen the original skin or try again before saving.',
        privateProRequired: 'Saving private creations requires Pro.',
        fileTooLarge: 'File too large, max support 512KB',
        invalidDimensions: 'Invalid dimensions, must be 64x64',
        slimMode: 'Slim',
        strongMode: 'Strong',
        hue: 'Hue',
        saturation: 'Saturation',
        brightness: 'Brightness',
        contrast: 'Contrast',
        adjust: 'Adjust',
        kmeans: 'K-Means Quantization',
        kmeansClusters: 'Target Colors (K)',
        kmeansDescription: 'Merge similar colors using K-Means to make skin colors cleaner and more pixelated.',
        kmeansPalettePreview: 'Palette Preview'
    },
    user: {
        accountStatus: 'Account Status',
        creativeMode: 'Online / Creative Mode',
        priorityPoints: 'Priority Points',
        profile: 'Profile',
        settings: 'Settings',
        orders: 'My Orders',
        logout: 'Logout',
        regular: 'Regular',
        proExpires: 'Expires:',
        renewViewPro: 'View PRO',
        activatePro: 'Activate PRO',
        language: 'Language',
        login: 'Login',
        notifications: {
            title: 'Notifications',
            markAllRead: 'Mark all as read',
            empty: 'No notifications',
            like: 'liked your post',
            comment: 'commented on your post',
            reply: 'replied to your comment',
            prev: 'Prev',
            next: 'Next',
            pageLabel: 'Page {page} of {total}'
        },
        profileDialog: {
            googleAccount: 'Google Account',
            visibleOnlyToYou: 'Visible only to you',
            nickname: 'Nickname',
            nicknamePlaceholder: 'Enter nickname...',
            saveNickname: 'Save nickname',
            nicknameUpdated: 'Nickname updated successfully!',
            saveFailed: 'Failed to save',
            networkError: 'Network error, please try again',
            characterReset: 'Character reset',
            resetFailed: 'Failed to reset character',
            myCharacter: 'MY CHARACTER',
            resetCharacter: 'Reset Character',
            resettingCharacter: 'Resetting...',
            setFromFigureModel: 'Set from figure model',
            noCharacterSet: 'No character set',
            currentAvatar: 'Current Avatar',
            generatedFromMyCharacter: 'Generated from MY CHARACTER',
            syncedFromGoogle: 'Synced from Google',
            cancel: 'Cancel'
        }
    },
    common: {
        auto: 'Auto',
        navigation: 'Navigation',
        authRequired: 'Please login',
        connectError: 'Failed to connect to server',
        sessionExpired: 'Session expired, please log in again.',
        requestFailed: 'Request failed',
        requestError: 'Request Error',
        networkError: 'Network Error',
        networkConnectFailed: 'Network connection failed'
    },
    placeholder: {
        building: 'Module under construction',
        soon: 'More exciting features coming soon...'
    },
    orders: {
        support: 'Support: ',
        loading: 'Loading...',
        noOrders: 'No records',
        orderId: 'Order ID',
        orderTime: 'Order Time',
        payTime: 'Paid Time',
        shippingFee: 'Shipping Fee',
        orderItems: 'Items',
        subscription: 'Subscription',
        cancelOrder: 'Cancel Order',
        payNow: 'Pay Now',
        deleteOrder: 'Delete Order',
        loadMore: 'Load More',
        confirmCancel: 'Are you sure you want to cancel this order?',
        confirmDelete: 'Are you sure you want to delete this item?',
        confirmDeleteOrder: 'This action cannot be undone. Are you sure you want to delete this order?',
        cancelSuccess: 'Cancel Success',
        cancelFailed: 'Cancel Failed',
        deleteSuccess: 'Delete Success',
        deleteFailed: 'Delete Failed',
        networkError: 'Please check your network connection',
        tip: 'Tip',
        operationFailed: 'Operation failed',
        networkTitle: 'Network Error',
        addToOrderFailed: 'Failed to add to order',
        addToPendingOrderTitle: 'Continue Shopping',
        addToPendingOrderHint: 'Continue shopping and your items will be automatically merged into unpaid orders with the same address.',
        deleteItem: 'Delete item',
        statuses: {
            pending_payment: 'Pending',
            paid: 'Paid',
            shipping: 'Shipping',
            completed: 'Completed',
            cancelled: 'Cancelled'
        },
        subscriptions: {
            pro_1m: 'PRO - Monthly',
            pro_3m: 'PRO - 3 Months',
            pro_6m: 'PRO - 6 Months',
            pro_1y: 'PRO - 1 Year'
        },
        shippingAddress: 'Shipping Address',
        totalAmount: 'Total Amount'
    },
    pro: {
        title: 'Pro Subscription',
        benefits: 'Unlock Pro Benefits',
        plans: 'Choose Your Plan',
        currentPlan: 'Current Plan',
        subscribe: 'Subscribe Now',
        cancel: 'Cancel Subscription',
        cancelConfirm: 'Are you sure you want to cancel your active Pro subscription? You will still retain your Pro status until the end of your billing cycle.',
        cancelSuccess: 'Your subscription has been cancelled.',
        cancelFailed: 'Failed to cancel subscription',
        recommended: 'RECOMMENDED',
        supportText: 'Support: ',
        successMessage: 'Subscription Success! Pro Activated.',
        upgrade: 'Upgrade',
        buyCreditsTip: 'You can purchase Credits directly as needed.',
        buyCreditsBtn: 'Buy Credits Directly',
        plansData: {
            free: 'Free',
            pro_plus: 'Pro-Plus Subscription',
            pro_max: 'Pro-Max Subscription',
            month: 'Month'
        },
        perks: {
            free: {
                title: 'Free',
                price: '0',
                quota: 'Claim 10 credits monthly.',
                collections: 'Public collections only',
                private: 'No private space',
                priority: 'Regular priority',
                experimental: 'Basic model access',
                commercial: 'Generated skins are available to anyone for non-commercial use under CC BY-NC 4.0'
            },
            pro_plus: {
                title: 'Pro-Plus',
                price: '8',
                quota: 'Get extra 80 credits monthly.',
                collections: 'Support private collections',
                private: '1,000 private skins limit',
                priority: 'High priority queue',
                experimental: 'Early access to new features',
                commercial: 'Skins generated during subscription enjoy permanent commercial license'
            },
            pro_max: {
                title: 'Pro-Max',
                price: '20',
                quota: 'Get extra 200 credits monthly.',
                collections: 'Support private collections',
                private: '5,000 private skins limit',
                priority: 'High priority queue',
                experimental: 'Early access to new features',
                commercial: 'Skins generated during subscription enjoy permanent commercial license'
            }
        }
    },
    credits: {
        pageTitle: 'Credit Balance Details',
        pageDesc: 'View your credit logs, including balance increases and generation consumption.',
        balanceLabel: 'Current Balance',
        topUpTitle: 'Buy Credits',
        creditsFor: '{credits} Credits',
        paypalButton: 'Purchase',
        waitingPayment: 'Waiting for payment...',
        purchaseSuccess: 'Credits Added!',
        purchaseSuccessMsg: '{credits} credits have been added to your account.',
        tableTime: 'Time',
        tableType: 'Type',
        tableSource: 'Source / Description',
        tableAmount: 'Amount',
        loading: 'Loading transactions...',
        empty: 'No credit logs found',
        prevPage: 'PREV',
        nextPage: 'NEXT',
        pageInfo: 'PAGE {page} OF {total}',
        actionDailyLogin: 'Daily Login',
        actionMonthlyLogin: 'Monthly Login',
        actionGeneration: 'Generation',
        actionRefund: 'Refund',
        actionSubscriptionGrant: 'Subscription Grant',
        actionPurchase: 'Purchase',
    },
    modal: {
        payOrder: 'Pay Order',
        cancel: 'Cancel',
        confirm: 'Confirm',
        paySuccess: 'Payment Success',
        payFailed: 'Payment Failed',
        loadingConfig: 'Loading Configuration...',
        processingPayment: 'Processing Payment...',
        paypalProratedDifference: 'PayPal will calculate the prorated difference'
    },
    print: {
        title: '3D printed Pixel-Style Collectible Figurine',
        description: 'Product combines 3D printed white model + HD color restoration stickers for pixel-perfect replication.',
        priceLabel: 'Unified Price',
        shippingLabel: 'Shipping',
        freeShipping: 'Free Global Shipping',
        deliveryTime: '2-4 weeks delivery',
        trackingLabel: 'Tracking',
        fullTracking: 'Full Trackable',
        realTimeUpdates: 'Real-time updates',
        dimensionsLabel: 'Dimensions',
        modelMaterialLabel: 'White Model',
        modelMaterial: 'PLA, TPU',
        modelMaterialDesc: 'High-Precision Printing',
        stickerMaterialLabel: 'Stickers',
        stickerMaterial: 'Photo-Grade Adhesive Waterproof Paper',
        stickerMaterialDesc: 'Accurate Colors / Matte Texture',
        features: {
            articulated: { title: 'Flexible & Articulated', desc: 'Multi-joint free adjustment, unlock infinite poses' },
            precision: { title: 'High-Precision Printing', desc: '3D printed high-precision white model, restoring every detail' },
            clarity: { title: 'HD Image Quality', desc: 'HD adhesive sticker, pixel details fully revealed' },
            color: { title: 'Color Restoration', desc: 'High color saturation, using photo-grade printers and paper' }
        },
        discoverSkins: 'Discover Skins',
        fromCollection: 'Choose from Collections',
        uploadLocal: 'Upload Local Skin',
        itemInfo: 'Item Info',
        specs: 'Specifications',
        type: 'Type',
        shipTo: 'Ship to:',
        change: 'Change',
        noAddress: 'No address, please add',
        continue: 'Continue',
        uploadFailed: 'Failed to upload custom model',
        infoMissing: 'Model info missing, please try again',
        selectAddress: 'Please select shipping address',
        createFailed: 'Failed to create order',
        modelNameLabel: 'Model Name',
        materialLabel: 'Material',
        materialDetail: '3D Printed Base(PLA); 3D Printed Joint(TPU); Stickers',
        dimensionsDetail: 'approx. 50×12.5×100 mm',
        soldOutNotice: 'Sorry, this model has reached its production capacity limit and temporarily cannot be ordered (does not affect submitted orders).',
        ecoMaterial: 'Eco Material',
        oneToOne: '1:1 Replica',
        whiteModelSticker: 'White Model + Stickers',
        soldOut: 'Sold out / Capacity full (Try again tomorrow)',
        fileTooLarge: 'File too large, max support 512KB',
        ageWarning: '14+ Adult collectible, not a toy for children',
        promoLabels: {
            video: 'Video',
            style1: 'Style 1',
            style2: 'Style 2',
            style3: 'Style 3'
        },
        loginPrompt: 'Login to use 3D print features',
    },
    address: {
        managerTitle: 'Shipping Address',
        addAddress: 'Add Address',
        editAddress: 'Edit Address',
        country: 'Country',
        zipCode: 'Zip/Postal',
        phone: 'Contact Phone',
        state: 'State/Prov',
        city: 'City',
        detailAddress: 'Address',
        setDefault: 'Set as default',
        save: 'Save',
        addedCount: 'Added {count}/10',
        addNew: 'Add New',
        noAddresses: 'No addresses',
        maxAddresses: 'Maximum 10 addresses allowed',
        fillAllFields: 'Please fill in all fields',
        saveFailed: 'Save failed',
        confirmDelete: 'Are you sure to delete this address?'
    },
    terms: {
        title: 'Terms of Service & Privacy Policy',
        intro: 'Welcome to our service! Before you start, please read our Terms of Service and Privacy Policy.',
        decline: 'Decline & Exit',
        agree: 'Agree & Continue',
        tos: 'Terms of Service',
        privacy: 'Privacy Policy'
    },
    termsOfService: {
        title: 'EntropyDrop Terms of Service',
        lastUpdatedLabel: 'Last updated',
        lastUpdated: 'August 30, 2026',
        sections: [
            {
                title: '1. Acceptance and Scope',
                content: `The Services are operated by Shanghai EqualRank Technology Co., Ltd. (“EntropyDrop,” “we,” “us,” or the “Platform”). Please read these Terms carefully before registering an account, making a purchase, or using EntropyDrop, especially the provisions concerning public content, intellectual property, paid services, and limitations of liability.

By clicking “Agree & Continue,” registering an account, purchasing a Service, or continuing to use EntropyDrop, you acknowledge that you have read, understood, and agreed to these Terms and the Privacy Policy. If you do not agree, stop using the Services.

The “Services” include the entropydrop.com website and its AI image, game character skin, and 3D model generation, editing, and conversion tools; content storage, display, search, collections, likes, and sharing; forums and community features; friend connections, Space chat, direct messages, and other social features; the EntropyDrop Space multiplayer world, world editing, programmable entities, and resource marketplace; AI Agents, developer APIs, Credits, Pro subscriptions, custom 3D-printed products; and other related features we may introduce. Some features may be experimental or subject to additional rules displayed in the applicable interface, API documentation, or developer console.`
            },
            {
                title: '2. Eligibility and Minors',
                content: `The Services are generally intended for users who are at least 14 years old.

Users under 18 must review these Terms, use the Services, and make purchases with the consent and guidance of a parent or legal guardian. Guardians should reasonably supervise a minor’s usage time, interactions, and purchases.

We do not knowingly offer account services to children under 14. If we learn that we collected a child’s personal information without valid guardian authorization, we will delete it or take other necessary protective measures. If we later permit children under 14 to use a particular Service, we will publish separate children’s privacy rules and obtain guardian consent.`
            },
            {
                title: '3. Accounts and Security',
                content: `You may currently sign in using a Google account or another supported method. You must provide accurate information that you are authorized to use, protect your login credentials, refrain from renting, selling, gifting, or sharing your account, refrain from impersonating others or Platform personnel, and contact us promptly if you discover unauthorized access or suspicious activity.

To the extent permitted, you are responsible for losses resulting from your failure to secure your account, voluntary sharing of credentials, or use of an insecure third-party service.`
            },
            {
                title: '4. AI Services, AI Agents, APIs, and Outputs',
                content: `AI outputs are probabilistic and uncertain. We do not guarantee that an output will be accurate, unique, error-free, or aligned with your preferences; qualify for intellectual-property protection; differ from outputs provided to other users; be suitable for any particular commercial, manufacturing, safety-critical, or professional purpose; or function on every third-party platform.

A future AI Agent may, at your direction, read context you choose to provide, generate or execute code, call tools, APIs, or third-party services, and create, modify, publish, or delete content or objects in Space. An Agent may misunderstand instructions, produce inaccurate results, or take an unintended action. Review the scope of an Agent’s permissions before authorization, and review and confirm payments, publications, deletions, external communications, changes to important data, and other difficult-to-reverse actions before execution. Agent actions authorized through your account are generally treated as initiated by you. We may require additional confirmation, restrict permissions, or pause execution for higher-risk tools.

If we provide developer APIs, you must follow the API documentation and protect API keys. Requests, usage, and fees associated with your key are generally attributed to your account. You may not share, publish, sell, or misuse a key; circumvent rate, quota, billing, permission, or security limits; or resell, relay, or provide the API in a manner that directly substitutes for the EntropyDrop Service without written permission. We may set or change model, rate, concurrency, quota, file-size, context, and other technical limits for security, capacity, and fair-use reasons, and may upgrade or retire older API versions. We will provide advance notice where reasonably possible for material breaking changes.

Before publishing, selling, commercially using, or relying on generated content, Agent results, or API outputs, you must review their content, technical suitability, and rights status. Do not use them as the sole basis for medical, legal, financial, personal-safety, or other high-impact decisions. You are responsible for obtaining any necessary permission for content involving a person’s likeness, brand, character, building, artwork, or other third-party material.`
            },
            {
                title: '5. Credits, Subscriptions, and Virtual Items',
                content: `Credits are digital benefits usable only for designated EntropyDrop features. They are not currency, have no cash value, and generally may not be transferred, sold, redeemed for cash, or traded outside the Platform. In the future, the Platform may allow you to use Credits to obtain virtual items, resources, or related usage entitlements in the Space marketplace. Unless the purchase page states otherwise, acquiring a virtual item provides only a limited right to use it within the Services under the displayed rules; it does not transfer intellectual-property rights or ownership of real-world property. Virtual items may not be redeemed for cash or traded outside the Platform.

If a generation fails because of a technical failure confirmed by us, or a marketplace purchase for which Credits were deducted is not delivered because of a Platform failure, we may return the corresponding Credits. Credits used for a successfully processed generation or a properly delivered virtual item are generally non-refundable unless the purchase page states otherwise, a systemic Platform error occurred, or applicable requirements provide otherwise.

Pro-Plus, Pro-Max, and similar subscriptions renew automatically for the period shown at purchase until you cancel. After cancellation, benefits generally continue through the current paid billing period, after which renewal stops. Unless the purchase page, payment-provider rules, or mandatory requirements provide otherwise, a billing period that has already begun is generally not prorated based on unused time.

AI Agent or API Services may be billed by request count, input and output volume, compute time, tool calls, storage, bandwidth, or another metric displayed on the purchase page or developer console. Fees charged by third-party tools or services may be billed separately by those providers. Except for billing errors, duplicate charges, a confirmed Service failure, or another applicable exception, Agent or API usage that was actually processed is generally non-refundable.

We may change prices, allowances, or plan features. We will provide reasonable advance notice of material changes to renewal prices or core benefits. We may revoke Credits, subscription benefits, or virtual resources obtained through fraud, chargebacks, exploitation of a vulnerability, or other improper means.`
            },
            {
                title: '6. Licenses for Generated Works',
                content: `To the extent you hold the relevant rights, you retain rights in content you independently create and upload. Uploading content does not automatically transfer ownership to EntropyDrop.

Works generated under the Free plan are offered under CC BY-NC 4.0. To the extent EntropyDrop can grant the relevant rights, the generating user and other users may, with attribution, use, copy, share, and adapt them for personal, educational, research, and other non-commercial purposes. They may not be used directly or indirectly in commercial sales, commercial promotions, paid projects, or other revenue-generating activities.

For a work generated during an active Pro-Plus, Pro-Max, or other paid period expressly marked as including commercial rights, and that is not restricted by an upstream non-commercial or unknown license, the account that generated it receives a perpetual, worldwide, non-exclusive commercial-use license. A commercial license already obtained remains valid after the subscription ends. If the work is Public, other users receive only the CC BY-NC 4.0 non-commercial license; public display, viewability, or download access does not grant them commercial-use rights.

Editing or regenerating a work does not broaden the source work’s license. An edit or regeneration based on a CC BY-NC 4.0 work remains non-commercial; one based on a legacy upload with an unknown license remains unknown. A generating user editing their own commercially licensed work may retain that commercial license. Another user editing or regenerating a Public work may rely only on the non-commercial license offered to the public.

Before saving an independently created or imported skin, the interface requires you to confirm that you hold the rights needed for the selected license. Where the selector is available, an active Pro account may choose the displayed EntropyDrop commercial-use license for that saving account; this choice does not create, clear, or transfer any third-party rights that you do not already hold. If the commercial option is unavailable or you choose CC BY-NC 4.0, the saved work is recorded as non-commercial. When either version is made Public, other users receive only CC BY-NC 4.0; a creator-only commercial license never extends to them. Private saving grants no new public access. Skins uploaded before license tracking was introduced are marked “Unknown license.” A valid CC BY-NC 4.0 license is irrevocable; deleting a work or making it Private does not withdraw a license already validly received by another person.

These licenses cover only rights that EntropyDrop, the uploader, or another licensor can grant and exclude third-party trademarks, characters, likenesses, copyrighted material, and other third-party rights. Whether an AI output is protected by intellectual-property rights may depend on the jurisdiction, the human creative contribution, and the particular work.

Outputs produced through an AI Agent or API are governed by the license shown for the applicable plan, API documentation, or developer console at the time of the request. Unless otherwise stated, the same rules apply as for comparable outputs generated directly under the same account and paid tier.

Because of the nature of AI, other users may receive identical or similar outputs. We do not promise exclusive rights solely because you generated or used a particular output.`
            },
            {
                title: '7. Public Content, Private Content, and Platform License',
                content: `When you designate a work as “Public,” its output, prompt, source image, intermediate processing results, author name, avatar, model parameters, and related public interactions may be accessed, displayed, or downloaded by anyone through pages, shared links, or public interfaces. Do not make content public if it contains identity documents, contact information, private photographs, information about minors, or other sensitive information.

For Public Content, in addition to the user-to-user public license shown on the work detail page, you grant EntropyDrop a worldwide, non-exclusive, royalty-free, sublicensable license to store, reproduce, transform, and display the content; provide search, sharing, recommendation, derivative-creation, and community features; conduct safety review, moderation, and infringement handling; reasonably promote the Services; and evaluate, fine-tune, or train models using Public Content that is expressly identified as eligible for model improvement. A work’s Public status is independent of the generating user’s license; a creator-only commercial license displayed on the detail page does not extend to other users merely because the work is Public.

If you delete Public Content or make it Private, we will stop using it for new public displays and new training runs. However, content already used in completed model training may not be separable or capable of being reverse-removed from model parameters, and rights already validly received by third parties under an irrevocable public license are unaffected, except where mandatory requirements provide otherwise.

Direct messages, chats limited to specified participants, and non-public friend information are also treated as Private Content. Private Content is used only to provide generation, storage, editing, download, message delivery, security, and necessary technical support. Without your separate permission, we will not publicly display Private Content, provide it to ordinary users other than recipients or participants you designate, or use it for model fine-tuning or training. Authorized personnel and service providers may process Private Content on a need-to-know basis to complete a generation or deliver a message, respond to a report or security incident, investigate an issue you submit, or fulfill necessary obligations.`
            },
            {
                title: '8. Social Features, Space Multiplayer World, and Marketplace',
                content: `In the future, the Platform may provide friend requests, friend lists, blocking, Space chat, direct messages, and other social features on the main site or in Space. Respect other users’ choices. You may not evade a rejection or block by repeatedly sending requests or messages or by switching accounts. We do not guarantee another user’s identity, statements, or intentions. If you encounter harassment, fraud, threats, or inappropriate content, stop interacting and use available blocking, reporting, or support channels.

World, channel, group, or proximity chat in Space may be visible to other participants within the applicable audience. Direct messages are generally displayed only to recipients you select, but “direct” or “private” does not mean end-to-end encrypted unless the product expressly says so. A recipient may save, capture, forward, or report a message. Do not send passwords, API keys, payment credentials, identity documents, precise locations, or other information you do not want the recipient to retain.

Space is a shared multiplayer environment. Other players may see your display name, character appearance, position, actions, world edits, and public resources in real time. Your terrain or structure edits may be merged with edits made by other players. To preserve world integrity, respond to abuse, and protect other users’ creations, some edits already incorporated into a shared world may remain in de-identified form after account deletion.

Blocksets, entities, colorsets, scripts, and other resources you publish to the Space marketplace are governed by the license and usage rules displayed in the publishing interface or resource detail page. We may change the licenses available for future publications or otherwise update marketplace rules, but doing so will not revoke licenses or usage entitlements already lawfully obtained by other users.

In the future, the Space marketplace may allow users to use Credits to obtain virtual items, resources, or related usage entitlements. The price, functionality, license scope, availability period, transfer restrictions, and other conditions shown on the resource detail page at the time of purchase apply. Purchasing a virtual item does not transfer intellectual-property rights belonging to the publisher or another rights holder.

You must ensure that published scripts and resources do not contain malicious code, backdoors, undisclosed data collection, or material that infringes third-party rights.`
            },
            {
                title: '9. Community Conduct and Prohibited Uses',
                content: `You may not use the Services to:

• Publish unlawful, sexually explicit, child-exploitative, terrorist, hateful, severely violent, fraudulent, or rights-infringing content;
• Harass, threaten, stalk, insult, discriminate against, or expose private information about another person;
• Send bulk or repeated unsolicited friend requests, direct messages, advertisements, promotions, phishing links, scams, or other spam;
• Groom, coerce, or deceive a minor into providing sensitive information, intimate content, off-platform contact details, or participating in inappropriate sexual interactions;
• Use another person’s likeness, work, trademark, trade secret, or personal information without authorization;
• Create or distribute cheats, unauthorized modifications, malicious scripts, viruses, or destructive code;
• Bypass authentication, access controls, content restrictions, payment mechanisms, or security measures;
• Access, probe, attack, or interfere with servers, accounts, networks, or databases without authorization;
• Use bots, crawlers, or automated scripts for bulk registration, artificial engagement, resource stockpiling, abnormal API use, or excessive consumption of computing resources;
• Disclose, sell, or misuse an API key; bypass API rate, quota, billing, permission, or security limits; or resell or relay an API without permission;
• Use an AI Agent or API to send spam, manipulate others, automate fraud, attack or monitor systems, or perform another unauthorized action;
• Scrape, mirror, bulk-download, or redistribute Platform data, public materials, or models without written permission;
• Impersonate another person or otherwise mislead users; or
• Use the Services in another manner that seriously harms the Platform or its users.

Lawful security research, expressly permitted interoperability, and code expressly released under an open-source license are not unreasonably restricted, but remain subject to the applicable license and responsible-disclosure practices.`
            },
            {
                title: '10. Moderation and Account Action',
                content: `Based on applicable rules, user reports, and reasonable safety judgments, we may reduce distribution, restrict interactions, temporarily hide or remove content, withdraw a resource, restrict features, suspend or terminate an account, or preserve necessary evidence.

To deliver messages, filter spam and malicious links, respond to reports, investigate fraud or security incidents, and fulfill necessary obligations, we may use automated systems and authorized personnel to review relevant accounts, friend relationships, chats, or direct messages on a need-to-know basis. When a direct message is reported, we may receive the reported message, necessary surrounding context, and related account information.

We may act immediately without advance notice in response to an urgent security risk, clearly unlawful content, fraud, attacks, cheating, or large-scale abuse. If you believe an action was mistaken, you may appeal at support@entropydrop.com.`
            },
            {
                title: '11. Custom Physical Products',
                content: `EntropyDrop’s 3D-printed products are “14+ collectibles,” not children’s toys, and are unsuitable for infants or young children.

Custom products are manufactured from the model you select or upload. Reasonable differences may exist between an on-screen preview and the physical product because of printing processes, materials, stickers, display color, and manual assembly. After a custom-product exclusion is conspicuously disclosed during checkout and separately confirmed by you, the product may be ineligible for return without cause. You may still request repair, remanufacture, replacement, return, or refund if the product has a serious quality problem, is incorrect or incomplete, is damaged in transit, or materially fails to match the order.

Once production begins, an order generally cannot be canceled unless otherwise required or agreed by us. Production and delivery times are estimates and may be affected by destination, customs, carriers, or events beyond reasonable control.

Purchasing a physical item gives you ownership of that item but does not transfer third-party rights in characters, artwork, or other protected material contained in it. You are responsible for custom content and resale activity involving third-party rights.`
            },
            {
                title: '12. Third-Party Services',
                content: `EntropyDrop may use or link to third-party services such as Google Sign-In, Google Analytics, AWS, PayPal, YouTube, shipping providers, foundation-model providers, tool or connector providers, and AI endpoints selected by users.

When you authorize an AI Agent to call a third-party tool or connect an external account, the Agent may send that third party instructions, content, and context needed to complete the task and receive results in return. Review the permission scope and third-party terms before authorization, and connect only accounts and data you are authorized to use.

Third-party services are independently provided and governed by their own terms and privacy practices. We will provide reasonable assistance with issues caused by a third-party service interruption, restriction, account action, or policy change, but we do not control third-party conduct.`
            },
            {
                title: '13. Service Changes and Availability',
                content: `We may modify, suspend, or discontinue parts of the Services for upgrades, security, maintenance, compliance, cost, or business reasons. For material changes to core subscription benefits, personal-data processing, or discontinuation of the Services as a whole, we will provide advance notice where reasonably possible and provide necessary export, refund, or other arrangements as applicable.

Experimental features may lose data, change compatibility, or be discontinued at any time. Do not rely on an experimental feature as your only critical production environment. AI models, Agent tools, API fields, response formats, and versions may also change as the Services evolve. We will use documentation, versioning, or migration periods where reasonably possible for material breaking changes.`
            },
            {
                title: '14. Disclaimers',
                content: `To the extent permitted, the Services are provided “as is” and “as available.” We do not guarantee that the Services will always be uninterrupted, error-free, or completely secure, or that an AI Agent or API will always follow instructions accurately, remain compatible, or complete every task. You should maintain your own backups of important works, source files, and scripts, grant Agents only the minimum permissions needed, and retain human review and recovery measures for important actions. We take reasonable measures to protect data, but no online service can promise absolute freedom from failures or security risks.`
            },
            {
                title: '15. Scope of Responsibility',
                content: `No limitation of responsibility applies where such a limitation is prohibited, including responsibility arising from intentional misconduct, gross negligence, personal injury, fraud, or infringement of mandatory consumer rights.

These Terms do not exclude or restrict any right you have to complain, report, seek mediation, request a refund, bring a claim, or exercise another non-waivable consumer right. Responsibility arising from a user’s breach of these Terms, infringement of third-party rights, or unlawful use of the Services remains with the responsible party.`
            },
            {
                title: '16. Account Termination and Data Handling',
                content: `You may stop using the Services and request account deletion by contacting support@entropydrop.com.

After deletion, you will no longer be able to access your works, Credits, subscription benefits, Space state, virtual items, or other account data. Order, payment, tax, security, and dispute records that must be retained may continue to be stored for the necessary period.

Termination does not affect payment obligations accrued before termination, valid licenses or usage entitlements already lawfully obtained by third parties, necessary preservation of evidence, or provisions that by their nature should survive.`
            },
            {
                title: '17. Updates and Contact',
                content: `We may update these Terms as the Services, our business, or applicable rules change. We will notify you of material changes through an in-product notice, email, or another reasonable method. If a material change requires renewed consent, we will ask for consent before it takes effect.

Operator: Shanghai EqualRank Technology Co., Ltd.
Product: EntropyDrop
Website: entropydrop.com
Email: support@entropydrop.com`
            }
        ]
    },
    privacyPolicy: {
        title: 'EntropyDrop Privacy Policy',
        lastUpdatedLabel: 'Last updated',
        lastUpdated: 'August 30, 2026',
        sections: [
            {
                title: '1. Scope and Controller',
                content: `Shanghai EqualRank Technology Co., Ltd. is the controller of personal information processed in connection with EntropyDrop. We process personal information lawfully, fairly, transparently, and only to the extent reasonably necessary.

This Policy applies to the EntropyDrop website, AI generation services, AI Agents and developer APIs we may offer in the future, friend, chat, direct-message, and other social features, community, Space, subscriptions, Credits, and custom-product services.`
            },
            {
                title: '2. Information We Collect',
                content: `Depending on the features you use, we may process:

• Browsing and access data: IP address, browser and device type, language, page visits, timestamps, network data, and error information, used to deliver pages, protect security, rate-limit requests, troubleshoot failures, and improve the Services;
• Google Sign-In data: Google ID, email address, account name, and avatar, used to create and authenticate accounts, send notices, and manage accounts;
• Profile data: display name, avatar, game character skin, and character model type, used for author attribution, community profiles, and Space characters;
• AI generation, editing, and license data: prompts, source images, outputs, intermediate results, model versions, parameters, seeds, visibility settings, license type and version, grant timestamp, commercial licensee, upload-license confirmation, and feedback, used to complete generations, store history, display and enforce licenses, record grants, charge Credits, recover from failures, and improve models;
• AI Agent and API data: conversations, instructions, context, files, and objects you choose to provide; tool calls and returned results; generated code; execution and action records; API-key identifiers; request and response metadata; usage, quotas, errors, and audit logs, used to understand requests, perform tasks, provide APIs, bill usage, debug failures, audit security, and prevent abuse;
• Community data: posts, comments, images, video links, collections, likes, reports, and notifications, used to provide community interaction, display content, and address violations;
• Friend and communications data: friend requests, friend lists, blocks, sender and recipient identifiers, chat and direct-message content and attachments, the relevant Space or channel, sent, delivery, and read status, timestamps, reports, and moderation records, used to establish friend connections, deliver and synchronize messages, provide blocking and reporting, protect safety, and prevent abuse;
• Space data: user and player identifiers, world identifiers, character position and state, world edits, public resources, scripts, marketplace listings, purchases, downloads, and virtual-item entitlement records, used for multiplayer synchronization, reconnect recovery, world persistence, marketplace operations, virtual-item delivery, and abuse prevention;
• Subscription and Credit data: plans, Credit balances and history, records of Credits used to obtain virtual items, PayPal order identifiers, subscription status, payment amounts, and timestamps, used for payment, entitlement delivery, renewal, refunds, reconciliation, and fraud prevention;
• Custom-product data: country or region, telephone number, postal code, state or province, city, street address, custom model, order, and shipment status, used for production, delivery, support, and necessary recordkeeping;
• Analytics data: cookies or similar identifiers, page visits, interaction events, device information, and approximate region, used to understand usage and improve the product; and
• Support data: email address, message content, attachments, and communication timestamps, used to answer questions, handle complaints, and provide after-sales support.

An uploaded image containing a face, identity document, health information, precise location, financial account information, or information about a minor may contain sensitive personal information. Do not upload such content unless the feature requires it and you have all necessary rights. We do not use uploaded photographs for facial identification.`
            },
            {
                title: '3. Sources of Information',
                content: `We obtain information:

• Directly from you when you register, complete a form, upload or create content, make a purchase, or contact us;
• Automatically when you use the website, an API, or Space;
• From third parties such as Google, PayPal, or shipping providers based on your authorization or transaction; and
• From interactions by other users, such as likes, comments, reports, or replies involving your content.`
            },
            {
                title: '4. Purposes and Grounds for Processing',
                content: `We process personal information only where necessary to create an account, establish friend connections, deliver chats or direct messages, complete a generation, respond to an API request, perform an Agent task you authorize, provide a multiplayer world, or fulfill an order or subscription; where you have provided consent or separate consent; to fulfill necessary obligations; to protect users, the Platform, or the public from threats to personal or property safety; where permitted for cybersecurity, fraud prevention, troubleshooting, and reasonable product improvement; or within a reasonable scope when processing information you made public or that was otherwise lawfully made public.

Refusing optional information will not affect basic features. Refusing information required for a specific Service may prevent that Service from functioning.`
            },
            {
                title: '5. Public and Private Content',
                content: `If you choose “Public,” outputs, source images, intermediate processing results, prompts, titles, model parameters, derivation relationships, license type and status, display name, avatar, character skin, generating-user identifier, public collections, like counts, forum content, world- or channel-visible Space chat, and Space marketplace resources may be visible to the applicable participants or anyone. Other users may view, download, capture, share, link to, or redistribute Public Content outside the Platform. Copies previously saved by third parties may remain beyond our control after you delete the content, and an irrevocable license already validly received by a third party may remain effective.

Under the Free plan, generated content generally can only be stored as Public and is offered to anyone for non-commercial use under CC BY-NC 4.0. When you save or import a skin, we record your rights confirmation, selected creator license, applicable public license, confirmation time, and associated work to evidence and administer the license. An eligible Pro account may select a creator-only commercial license where offered, while other users of a Public work still receive only CC BY-NC 4.0; legacy uploads may display “Unknown license.” Check the visibility and license notice before submission, and do not upload personal photographs, sensitive information, or a work you lack authority to license. After clear notice and the relevant authorization, we may use Public Content, prompts, and quality feedback for model evaluation, fine-tuning, or training.

Direct messages, chats limited to specified participants, non-public friend information, AI Agent conversations, API inputs, context you provide, and private data obtained through tools are treated as Private Content. Private Content is not displayed to ordinary users other than recipients or participants you select and is not used for model fine-tuning or training. We access Private Content only to provide generation, respond to an API request, perform an Agent task you authorize, deliver messages, provide storage, editing, security, respond to reports or an issue you submit, or perform another necessary function, subject to access controls.

A direct-message recipient may save, capture, forward, or report content they receive. When a message is reported, the reported content, necessary surrounding context, and related account information may be provided to Platform reviewers. Direct messages are not end-to-end encrypted unless the product expressly says otherwise.`
            },
            {
                title: '6. Cookies, Browser Storage, and Analytics',
                content: `We use an HttpOnly-protected cookie for the renewable login session and localStorage for a short-lived access token. We also use localStorage, sessionStorage, and IndexedDB for language, interface, and camera settings; Space backpacks, palettes, and unsynchronized world edits; resource caches and temporary session state; and AI Agent endpoint, model, and context settings.

Space API keys remain only in the current page session and are not persisted to localStorage. When you use a custom AI endpoint, your prompt, necessary game context, and API key are sent directly by your browser to the provider you select and are governed by that provider’s privacy policy.

When configured, the website may use Google Analytics. Where required, we will obtain consent before enabling analytics and provide a method to reject or withdraw analytics-cookie consent. PayPal, Google Sign-In, and embedded YouTube content may also set cookies or similar identifiers under their own practices.`
            },
            {
                title: '7. Sharing, Service Providers, and Disclosure',
                content: `We do not sell personal information or provide it to third parties for their independent behavioral advertising.

To provide the Services, we may share the minimum necessary information with Google for account sign-in and website analytics; AWS for servers, databases, object storage, content delivery, and backups; PayPal for payments, subscriptions, refunds, reconciliation, and fraud prevention; YouTube for user-submitted public videos; 3D-printing, logistics, and shipping providers for custom-product production and delivery; foundation-model, AI endpoint, tool, or connector providers for a request you submit or an Agent task you authorize; and professional providers supporting security, auditing, legal services, or necessary technical operations.

An Agent should connect to external services only within the permission scope you authorize. Instructions, content, context, and tool results needed to complete a task may be transferred between EntropyDrop and the relevant third party. You may stop future access by disconnecting a service, revoking authorization, or changing Agent permissions, but this does not affect processing completed before revocation.

When you send a friend request, chat, or direct message, your display name, avatar, account identifier, message, attachment, and necessary status information are provided to recipients you select or who are within the feature’s stated audience. Recipients are responsible for information they independently retain or reshare.

We may also make necessary disclosures in response to an authorized governmental request, to address fraud, attacks, infringement, or an urgent safety incident, or in connection with a merger, restructuring, or asset transfer, subject to continued appropriate protection by the recipient.

If the Platform’s public financial pages display transaction information, names, email addresses, and other direct identifiers will be removed, masked, or de-identified.`
            },
            {
                title: '8. International Processing',
                content: `Because Google, AWS, PayPal, YouTube, and other providers may operate in different countries or regions, your information may be transferred to or stored outside your country or region.

We will take appropriate measures such as data minimization, contractual safeguards, security assessments, certification, standard contractual clauses, or separate consent where applicable. Where required, we will provide information about the overseas recipient, processing purpose, data categories, and available methods for exercising your rights.`
            },
            {
                title: '9. Retention',
                content: `We retain information only for the shortest period reasonably necessary for the purposes described in this Policy:

• Account data: while the account remains active; after a verified deletion request, primary systems are generally deleted or anonymized within 30 days;
• Generation records and works: until you delete them or delete the account; public caches may take up to 30 days to update;
• AI Agent conversations, task context, and execution records: until you delete the relevant task, disable the applicable history, or delete the account; records needed for security, billing, and auditing may remain for the necessary period;
• API request metadata, usage, and security logs: generally no longer than six months; records needed for billing, refunds, disputes, or abuse prevention are retained for the necessary period;
• Friend and block relationships: until you remove the relationship, delete the account, or the feature ends; records needed for reports, safety, or prevention of repeated harassment may remain for the necessary period;
• Chats and direct messages: for the period shown in the product, or until you delete a message, the relevant conversation ends, or the account is deleted; delivered messages may remain in a recipient’s account, and report evidence or safety records may remain for the necessary period;
• System backups: generally overwritten on a rolling basis within 90 days;
• Space player state: until account deletion; shared-world edits may remain in de-identified form;
• Space marketplace resources and virtual-item records: while a resource is listed or as needed to provide purchasers with entitlements or maintain transaction integrity; publisher identity links may be removed after account deletion, while necessary transaction and entitlement records may remain;
• Technical and security logs: generally no longer than six months unless a longer period is necessary for an active security incident or another applicable requirement;
• Shipping addresses: until you delete the address or account;
• Order, payment, refund, and financial records: for necessary tax, accounting, and consumer-protection retention periods;
• Support records: generally for three months after resolution, unless a dispute or another necessary circumstance requires longer retention; and
• Browser-local data: on your device until you clear site data or uninstall the relevant application.`
            },
            {
                title: '10. Security',
                content: `We apply safeguards appropriate to the risk, including encryption in transit, access control, separation of public and private storage, least-privilege access, logging and monitoring, backups, security updates, and confidentiality obligations.

No online service can guarantee absolute security. If personal information is leaked, altered, or lost in a manner that may affect your interests, we will take remedial measures and provide notifications to affected users and relevant authorities as applicable.`
            },
            {
                title: '11. Your Rights',
                content: `Where applicable, you may request access to, a copy of, or export of personal information; correct or supplement inaccurate information; manage friends, remove a friend connection, or block another user; delete messages where the product supports deletion, works, addresses, or an account; change content visibility; withdraw consent; restrict or object to particular processing; close an account; request an explanation of our processing practices; or appeal an account, content, or privacy decision.

Withdrawal does not affect processing completed before the withdrawal. You may exercise available rights through product features or by emailing support@entropydrop.com. We may reasonably verify your identity to protect account security.`
            },
            {
                title: '12. Minors',
                content: `We do not knowingly offer account services to children under 14. If you are at least 14 but under 18, use the Services with the consent and guidance of a parent or legal guardian. A guardian may contact us to request access to, correction of, or deletion of a minor’s information.

If we learn that we collected information from a child under 14 without valid authorization, we will promptly stop processing and delete it.`
            },
            {
                title: '13. Policy Updates and Contact',
                content: `We may update this Policy as our features, providers, or applicable rules change. We will provide an in-product notice, email, or another prominent notice of material changes. If a change involving a new processing purpose, sensitive personal information, public display, model training, or international transfer requires renewed consent, we will ask for it again.

Controller: Shanghai EqualRank Technology Co., Ltd.
Product: EntropyDrop
Website: entropydrop.com
Email: support@entropydrop.com`
            }
        ]
    },
    mcmodal: {
        previewUnavailable: 'Preview unavailable',
        editName: 'Edit Name',
        noName: 'No Name',
        author: 'Author',
        relatedCollections: 'Related Collections',
        derivedFrom: 'Derived From',
        originalSkinDeleted: 'Original Skin Deleted',
        derived: 'Derived',
        allDerived: 'All Derived',
        model: 'Model',
        seed: 'Seed',
        guidance: 'Guidance',
        steps: 'Steps',
        id: 'ID',
        created: 'Created',
        report: 'Report',
        reportTitle: 'Report this content',
        reportSuccess: 'Report submitted, we will verify it soon',
        reasons: ['Inappropriate Content', 'Plagiarism/Infringement', 'Spam', 'Other'],
        reportEmailSubject: 'Content Report',
        loginToSeeMore: 'Log in to see more details',
        saveToCollection: 'Save to Collection',
        public: 'Public',
        private: 'Private',
        noCollection: 'No Collection',
        createCollection: 'Create Collection',
        confirm: 'Confirm',
        saving: 'Saving...',
        favorite: 'Favorite',
        share: 'Share',
        notFound: 'Skin not found or deleted',
        linkCopied: 'Link copied to clipboard',
        privateWarning: 'Private items cannot be saved to public collections',
        noPublicItems: 'No public items',
        loading: 'Loading...',
        slimMode: 'Slim',
        strongMode: 'Strong',
        feedbackTitle: 'Generation Quality',
        feedbackGood: 'Looks Good',
        feedbackBad: 'Glitched',
        feedbackThanks: 'Thanks for feedback! Recorded to help optimize the model.',
        discordPrompt: 'Want to give detailed feedback? Join our ',
        discordLinkText: 'Discord Community',
        setMyCharacter: 'Set as My Character',
        settingMyCharacter: 'Setting...',
        setMyCharacterSuccess: 'Set successfully!',
        setMyCharacterFailed: 'Failed to set',
        setMyCharacterNetworkError: 'Network error, please try again',
        setMyCharacterRequirement: 'Only public skins you created can be set as your character.',
        licenseTitle: 'License',
        licenseUnknown: 'Unknown license',
        licenseUnknownDescription: 'This work was uploaded before license tracking was introduced. EntropyDrop cannot confirm its permitted uses; contact the uploader before using it.',
        creatorCommercialLicense: 'Creator commercial license',
        creatorCommercialDescription: 'You generated this work and hold a perpetual, worldwide, non-exclusive commercial-use license.',
        publicNonCommercialDescription: 'Anyone may use, share, and adapt this work for non-commercial purposes with attribution under CC BY-NC 4.0.',
        privateLicenseDescription: 'This work is currently private and is not offered for new public access.',
        publicDoesNotGrantCommercial: 'Your commercial license belongs only to the creator account. Public display does not grant commercial rights to other users.',
        otherUserNoCommercial: 'You receive only the CC BY-NC 4.0 non-commercial license. Public visibility or download access does not grant commercial rights.',
        previousPublicLicense: 'This work was previously public. CC BY-NC 4.0 licenses already validly received are not withdrawn when it becomes private.',
        viewLicenseTerms: 'View the full CC BY-NC 4.0 terms',
        thirdPartyRightsNotice: 'The license covers only rights the licensor can grant and excludes third-party trademarks, characters, likenesses, copyrighted material, and other third-party rights.'
    },
    space_page: {
        title: 'EntropyDrop Space',
        eyebrow: 'PLAYABLE PROTOTYPE',
        platform: 'WebGL 2 · Voxel Physics · Earth / Donut Terrain',
        tagline: 'AI-Assisted Building & Autonomous Control Voxel Universe',
        description: 'Sculpt voxels in Earth mode by default, or switch to the seamless torus donut terrain in Settings. Turn structures into dynamic rigid bodies with one click, use AI-assisted building to construct complex machinery, and mount intelligent AI for autonomous control, cruising, and physical interaction directly in your browser.',
        primaryCta: 'Enter Space',
        offlineCta: 'Play Offline',
        secondaryCta: 'Core Features',
        stats: {
            scale: '0.2m Micro Sculpting',
            physics: 'Voxel Physics Engine',
            programmable: 'AI Building & Auto Control',
            torus: 'Earth / Donut Modes'
        },
        heroPreview: {
            title: 'Space Realtime Viewport',
            badge: 'LIVE VIEWPORT',
            status: 'STANDBY // 60 FPS'
        },
        featuresTitle: 'Core Mechanics & Systems',
        featuresSubtitle: 'From 0.2m micro-sculpting to rigid-body physics, AI-assisted building, and autonomous control.',
        features: [
            {
                tag: '0.2m DUAL-SCALE',
                title: 'Dual-Scale Voxel Sculpting',
                description: 'Build terrain with 1.0m standard blocks, switch seamlessly to 0.2m micro voxels (1/125 volume) with full 24-bit TrueColor palette for intricate mechanical and sculpting details.',
                badge: '1.0m / 0.2m // TrueColor',
                placeholderTitle: 'Dual-Scale Sculpting & Color Palette Screenshot'
            },
            {
                tag: 'VOXEL PHYSICS',
                title: 'Entityization & Voxel Physics',
                description: 'Box-select connected structures and press G to turn them into rigid bodies with automatic center of mass, inertia tensors, and high-frequency collision dynamics.',
                badge: 'RigidBody // G Key',
                placeholderTitle: 'Box Selection Entityization & Physics Collision Screenshot'
            },
            {
                tag: 'AI BUILDING & AUTO CONTROL',
                title: 'AI-Assisted Building & Autonomous Control',
                description: 'Leverage AI to assist in constructing intricate voxel machinery. Point at any entity and press C to direct autonomous hovering, waypoint cruising, and attitude stabilization with natural language prompts.',
                badge: 'AI Building & Auto-Pilot // C Key',
                placeholderTitle: 'AI Building & Autonomous Control Terminal Screenshot'
            },
            {
                tag: 'SWITCHABLE TERRAIN',
                title: 'Earth & Donut Terrain Modes',
                description: 'Explore a spherical Earth-style horizon by default, then switch to the boundary-free torus donut topology at any time in Settings. Both modes preserve continuous world travel without invisible walls.',
                badge: 'Earth / Torus // Switchable',
                placeholderTitle: 'Switchable Earth and Donut Terrain Screenshot'
            }
        ],
        agentDevTitle: 'Core Engine & Creator Ecosystem',
        agentDevSubtitle: 'Combining secure script sandboxes, real-time voxel physics, and a built-in marketplace for endless programmable creativity.',
        agentDevCards: [
            {
                icon: 'pixelarticons:code',
                title: 'AI Agent Control & QuickJS Realtime Sandbox',
                desc: 'Instantly transforms building instructions and motion intents into precise dynamical control logic, safely driving thrusters, pivots, and sensor loops inside isolated QuickJS WebAssembly sandboxes.'
            },
            {
                icon: 'pixelarticons:sliders',
                title: 'Voxel Physics & Rigid Body Dynamics',
                desc: 'Real-time solver for mass, center of mass, and inertia tensors of arbitrary voxel topologies with dynamics thrust, steering, gravity, and high-frequency collision solvers.'
            },
            {
                icon: 'pixelarticons:folder',
                title: 'Space Marketplace & Blueprint Hub',
                desc: 'Built-in resource marketplace supporting one-click publishing and downloading of programmable rigid bodies, micro-voxel assemblies, and palette presets for instant cross-world reuse.'
            }
        ],
        closingTitle: 'An infinite voxel universe is ready for you.',
        closingSubtitle: 'No downloads or installations required. Launch into the WebGL 2 voxel universe directly inside your modern desktop browser.',
        communityLinks: {
            github: 'GitHub Repository',
            discord: 'Discord Community'
        }
    },
    public_page: {
        title: 'Open Production',
        introduction: {
            title: 'About Us',
            company: 'Shanghai EqualRank Technology Co., Ltd.',
            desc: 'Committed to building root trust infrastructure and an open production system.'
        },
        vision: {
            title: 'Our Vision',
            content: 'Our vision is to build a verifiable, auditable, and community-governed open production system—from code and algorithms to automated production lines, and from decision-making processes to financials and assets, eliminating every single black box. Through decentralized decision-making protocols, the community will jointly participate in the long-term evolution of the platform. The motivation for all this is extremely simple: Life feeds on negative entropy.',
            moreLabel: 'More',
        },
        roadmap: {
            title: 'Open Evolution Roadmap',
            activeStatuses: ['Active', '进行中'],
            developmentStatuses: ['In Development', '开发中'],
            modules: [
                {
                    title: 'Software',
                    icon: 'pixelarticons:code',
                    items: [
                        { title: 'System Architecture', desc: 'Architectural design, covering the systematic collaborative design of frontend, backend, and AI inference architectures.', status: 'Active', link: 'https://github.com/EntropyDrop' },
                        { title: 'Algorithms, Models, and Datasets', desc: 'Disclosing model weights, training methods, datasets, and the full data processing workflow.', status: 'Active', link: 'https://huggingface.co/EntropyDrop' },
                        { title: 'Decision Protocols', desc: 'Decentralized decision-making protocol based on Byzantine Fault Tolerance, ensuring all decision details are public, laying the foundation for community co-governance.', status: 'In Development' }
                    ]
                },
                {
                    title: 'Hardware',
                    icon: 'pixelarticons:device-laptop',
                    items: [
                        { title: '3D Printing Production Line', desc: 'From parametric design, intelligent slicing, automated material feeding, unmanned operations, to automated post-processing, building a smart 3D printing factory.', status: 'Planned' },
                        { title: 'Industrial Automation', desc: 'Based on simulation and reinforcement learning, driving multi-agent collaboration to build fully autonomous AI-native manufacturing units.', status: 'Planned' },
                        { title: 'Trusted Devices', desc: 'Based on Trusted Execution Environments and open hardware, ensuring data usage, algorithm execution, and production processes are verifiable, auditable, and support community governance.', status: 'Planned' }
                    ]
                },
                {
                    title: 'Assets',
                    icon: 'pixelarticons:briefcase',
                    items: [
                        { title: 'Financial Status', desc: 'An overview of platform revenue streams, operating expenditures, funds flow, and total assets.', status: 'In Development' },
                        { title: 'Fixed Assets', desc: 'A list of computing nodes, physical manufacturing equipment, and assets.', status: 'In Development' },
                        { title: 'Live Ledger', desc: 'A real-time, anonymized stream display of all platform financial revenue and expenditure transactions.', status: 'Active', link: '/public/ledger' }
                    ]
                }
            ]
        },
        articles: {
            title: 'Latest Updates',
            description: 'Read the latest updates, research, architecture deep-dives and development notes from EntropyDrop.',
            list: [
                { id: 'skin-reconstruction', title: 'From Rendering to Reconstruction: A New Workflow for Image-to-Minecraft-Skin', date: '2026-07-25', tags: ['Minecraft', 'Computer Vision', 'Geometry Reconstruction', 'Generative Model'], summary: 'Deconstructs the image-to-skin pipeline into normalized front/back views, deterministic foreground extraction, fixed-view geometry fitting, Dense UV Parser semantic routing, raw color sampling, and topological completion, and details data accumulation strategies for fully open-source model training.' },
                { id: 'architecture', title: 'EntropyDrop Backend Runtime Architecture and Elastic Scaling Boundaries', date: '2026-05-22', tags: ['Architecture', 'Backend', 'Scalability'], summary: 'A code-grounded view of API readiness, connection pooling, ECS Service Auto Scaling, singleton background services, one-off migrations, and the remaining GPU/RQ worker scaling boundary.' },
                { id: 'skingen', title: 'From Reference Images to Minecraft Skins: Generative Model Training in Practice', date: '2026-05-12', tags: ['LoRA', 'Fine-Tuning', 'Dataset', 'OpenSource'], summary: 'Based on the Flux2 Klein 4B base model, this article outlines the complete fine-tuning workflow for generating usable Minecraft skins from reference images, covering skin structure analysis, high-quality Control-Target dataset construction, LoRA training parameters, and Alpha Marker post-processing extraction.' },
                { id: 'root-trust-governance', title: 'Root Trust Governance Paradigm', date: '2026-04-29', tags: ['Governance', 'Root Trust'], summary: 'EntropyDrop frames decentralized decision-making as the root trust layer for a verifiable, auditable, and community-governed open production system.' }
            ]
        },
        assets_pages: {
            financials: {
                title: 'Financial Transparency',
                desc: 'A consolidated view of our platform\'s financial health, sustainability, and social impact.',
                source: 'Source: Live Ledger',
                empty: {
                    value: '—',
                    financials: 'No verified financial records yet',
                    breakdown: 'No records to aggregate'
                },
                stats: {
                    revenue: 'Total Revenue',
                    expenditure: 'Total Expenditure',
                    net_profit: 'Net Profit',
                    runway: 'Runway',
                    burn_rate: 'Monthly Burn',
                    margin: 'Profit Margin'
                },
                charts: {
                    trend: 'Revenue vs Expenditure Trend',
                    revenue_breakdown: 'Revenue Sources',
                    expenditure_breakdown: 'Expenditure Categories'
                }
            },
            fixed_assets: {
                title: 'Fixed Assets Disclosure',
                desc: 'Public ledger of physical and computing infrastructure powering the EntropyDrop ecosystem.',
                records: 'records',
                empty: 'No published and verified fixed asset records yet',
                source: 'Source: Fixed asset ledger pending integration',
                categories: {
                    compute: 'Compute Nodes',
                    hardware: 'Manufacturing Equipment',
                    infrastructure: 'Office & Network'
                },
                list_headers: {
                    item: 'Asset Name',
                    type: 'Category',
                    status: 'Status',
                    value: 'Estimated Value'
                }
            },
            ledger: {
                title: 'Real-time Ledger',
                desc: 'Shows PayPal revenue and AWS cloud billing records for each synchronization cycle, with sensitive user and transaction data anonymized.',
                fullData: 'Full datasets and financial ledger are open-sourced on GitHub',
                fullDataUrl: 'https://github.com/EntropyDrop/financial',
                bankLedger: 'Real-time bank ledger integration is in development',
                betaNotice: 'Currently in beta, data may be inaccurate',
                headers: {
                    date: 'Date',
                    type: 'Type',
                    source: 'Source',
                    desc: 'Description',
                    amount: 'Amount',
                    status: 'Status'
                },
                stats: {
                    net: 'Net Flow',
                    paypal: 'PayPal Revenue',
                    aws: 'AWS Bills',
                    sync: 'Sync Mode'
                },
                filters: {
                    all: 'All Entries',
                    paypal: 'PayPal',
                    aws: 'AWS'
                },
                sync: {
                    daily: 'API Sync',
                    rateLimit: 'Due to third-party API rate limits, updates are currently daily',
                    lastUpdate: 'Last Sync',
                    records: 'Records',
                    empty: 'No synced billing records'
                }
            }
        }
    },
    discovery: {
        searchPlaceholder: 'Search...',
        searchResult: 'Search Results',
        searching: 'Searching...',
        noResults: 'No results found',
        prev: 'Prev',
        next: 'Next',
        rateLimitTitle: 'Rate Limited',
        rateLimitMessage: 'Please wait 1 second before retrying',
        searchMinLengthWarning: 'Search query must be at least 3 characters',
        modeList: 'List View',
        mode3D: '3D View',
        sortByLikes: 'Most Liked',
        sortByTime: 'Latest',
        modelSeries: 'Model Series',
        allModelSeries: 'All Series'
    },
    monitor: {
        adminAccessRequired: 'Admin access required',
        failedFetchStats: 'Failed to fetch stats',
        connectionError: 'Connection error',
        liveSystemStatus: 'Live System Status • Last sync: ',
        systemOnline: 'System Online',
        globalSettingsTitle: 'Global Settings • Event Controller',
        globalSettingsDesc: 'Toggle global quota limits. When enabled, skin generation is fully unlimited for all.',
        unlimitedQuotaActive: 'UNLIMITED QUOTA ACTIVE',
        standardLimitsActive: 'STANDARD LIMITS ACTIVE',
        textToSkinToggleTitle: 'Text to Skin Maintenance Switch',
        textToSkinToggleDesc: 'Toggle maintenance for Text to Skin. When enabled, the Text to Skin button will be disabled.',
        imageToSkinToggleTitle: 'Image to Skin Maintenance Switch',
        imageToSkinToggleDesc: 'Toggle maintenance for Image to Skin. When enabled, the Image to Skin button will be disabled.',
        imageEditToSkinToggleTitle: 'Edit to Skin Maintenance Switch',
        imageEditToSkinToggleDesc: 'Toggle maintenance for Image Edit to Skin. When enabled, the Image Edit to Skin button will be disabled.',
        enabled: 'ENABLED',
        disabled: 'DISABLED',
        underMaintenance: 'UNDER MAINTENANCE',
        operational: 'OPERATIONAL',
        unlimitedEnabledMsg: 'Unlimited generation quota has been enabled globally!',
        unlimitedDisabledMsg: 'Unlimited generation quota disabled. Standard limits restored.',
        textToSkinEnabledMsg: 'Text to Skin generation enabled!',
        textToSkinDisabledMsg: 'Text to Skin maintenance mode enabled.',
        imageToSkinEnabledMsg: 'Image to Skin generation enabled!',
        imageToSkinDisabledMsg: 'Image to Skin maintenance mode enabled.',
        imageEditToSkinEnabledMsg: 'Image Edit to Skin generation enabled!',
        imageEditToSkinDisabledMsg: 'Image Edit to Skin maintenance mode enabled.',
        operationFailed: 'Operation failed, please try again',
        networkError: 'Network connection error',
        deleteSkinSuccess: 'Skin {id} and associated resources successfully deleted.',
        deleteSkinFailed: 'Deletion failed: ',
        deleteUserSuccess: 'User account {email} and all associated data successfully deleted.',
        deleteUserFailed: 'Failed to delete user account: ',
        statusQueued: 'QUEUED',
        statusProcessing: 'PROCESSING',
        statusFailed: 'FAILED',
        modeTextToImage: 'Text to Image',
        modeImageToImage: 'Image to Image',
        modeImageEdit: 'Image Edit',
        modeImageToSkin: 'Image to Skin',
        modeTextToSkin: 'Text to Skin',
        modeEditToSkin: 'Edit to Skin',
        modeHumanEdit: 'Human Edit',
        modeHumanUpload: 'Human Upload',
        systemMaintenanceMsg: 'This feature is temporarily under maintenance.',
        temporarilyUnavailable: 'Under Maintenance'
    }
} as const
