interface SEOProps {
    title?: string
    description?: string
    keywords?: string
    ogImage?: string
    ogType?: 'website' | 'article'
    canonicalUrl?: string
}

export function SEO({
    title,
    description,
    keywords,
    ogImage,
    ogType = 'website',
    canonicalUrl,
}: SEOProps) {
    const defaultTitle = 'EntropyDrop'
    const defaultDesc = 'Open-Source Minecraft Skin Generator & Figure Manufacturer'
    const fullTitle = title ? `${title} | ${defaultTitle}` : defaultTitle
    const fullDesc = description || defaultDesc

    return (
        <>
            <title>{fullTitle}</title>
            <meta name="description" content={fullDesc} />
            {keywords && <meta name="keywords" content={keywords} />}

            {/* Open Graph / Facebook */}
            <meta property="og:site_name" content="EntropyDrop" />
            <meta property="og:type" content={ogType} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={fullDesc} />
            {ogImage && <meta property="og:image" content={ogImage} />}
            {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

            {/* Twitter */}
            <meta name="twitter:card" content={ogImage ? 'summary_large_image' : 'summary'} />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={fullDesc} />
            {ogImage && <meta name="twitter:image" content={ogImage} />}

            {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
        </>
    )
}
