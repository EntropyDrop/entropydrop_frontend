import { PageContainer } from '../components/PageContainer';
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { Link, useNavigate } from 'react-router-dom'

interface PublicPageProps {
    current: LangData
}

interface RoadmapItem {
    title: string
    desc: string
    status: string
    link?: string
}

interface RoadmapModule {
    title: string
    icon?: string
    iconColor?: string
    items: readonly RoadmapItem[]
}

interface ArticleItem {
    id: string
    title: string
    summary: string
    tags: readonly string[]
    date: string
}

export function PublicPage({ current }: PublicPageProps) {
    const data = current.public_page;
    const navigate = useNavigate();
    const roadmapModules: readonly RoadmapModule[] = data.roadmap.modules;
    const articles: readonly ArticleItem[] = data.articles.list;
    const activeStatuses = data.roadmap?.activeStatuses || [];
    const developmentStatuses = data.roadmap?.developmentStatuses || [];

    const getStatusStyle = (status: string) => {
        if (activeStatuses.includes(status)) {
            return {
                dot: 'bg-green-500 animate-pulse',
                text: 'text-green-500 font-bold',
            };
        }

        if (developmentStatuses.includes(status)) {
            return {
                dot: 'bg-white/15',
                text: 'text-white/30',
            };
        }

        return {
            dot: 'bg-white/20',
            text: 'text-white/40',
        };
    };

    return (
        <PageContainer>

            {/* Header */}
            <div className="flex flex-col gap-2 border-b border-white/10 pb-6 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm text-green-500 font-mono tracking-wider bg-green-500/10 self-start px-2 py-0.5 border border-green-500/30">OPEN SOURCE MISSION</span>
                    <a
                        href="https://github.com/EntropyDrop"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-white font-mono tracking-wider bg-white/10 self-start px-2 py-0.5 border border-white/30 hover:bg-white/20 transition-colors flex items-center gap-1.5"
                    >
                        <Icon icon="mdi:github" className="text-base" />
                        GITHUB
                    </a>
                    <a
                        href="https://huggingface.co/EntropyDrop"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#FFD21E] font-mono tracking-wider bg-[#FFD21E]/10 self-start px-2 py-0.5 border border-[#FFD21E]/30 hover:bg-[#FFD21E]/20 transition-colors flex items-center gap-1.5"
                    >
                        <Icon icon="simple-icons:huggingface" className="text-base" />
                        HUGGING FACE
                    </a>
                    <a
                        href="https://discord.gg/Vphxd9aqmX"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#5865F2] font-mono tracking-wider bg-[#5865F2]/10 self-start px-2 py-0.5 border border-[#5865F2]/30 hover:bg-[#5865F2]/20 transition-colors flex items-center gap-1.5"
                    >
                        <Icon icon="ic:baseline-discord" className="text-base" />
                        DISCORD
                    </a>
                </div>
                <h1 className={`text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-white via-white/80 to-white/40 bg-clip-text text-transparent ${current.fontClass}`}>
                    {data.title}
                </h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 shrink-0">
                {/* Left: Introduction (Company) */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <div className="bg-white/5 border border-white/10 p-6 flex flex-col gap-4 hover:bg-white/10 transition-all group relative overflow-hidden min-h-[380px] lg:h-full">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-green-500/10 transition-colors" />
                        <div className="flex items-center gap-3 text-green-500 border-b border-white/5 pb-3">
                            <Icon icon="pixelarticons:buildings" className="text-2xl" />
                            <h3 className={`text-base font-bold m-0 ${current.fontClass}`}>{data.introduction.title}</h3>
                        </div>
                        <div className="flex flex-col gap-4 flex-1">
                            <div className="flex flex-col gap-1">
                                <h4 className={`text-xl font-bold text-white ${current.fontClass}`}>
                                    {data.introduction.company}
                                </h4>

                            </div>
                            <p className={`text-white/70 text-sm leading-relaxed ${current.fontClass}`}>
                                {data.introduction.desc}
                            </p>
                            <div className="flex flex-wrap gap-3 mt-auto pt-2">
                                <a
                                    href="https://github.com/EntropyDrop"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 text-white/60 hover:text-white transition-all text-sm font-medium self-start group"
                                >
                                    <Icon icon="mdi:github" className="text-xl group-hover:scale-110 transition-transform" />
                                    <span>GitHub</span>
                                </a>
                                <a
                                    href="https://huggingface.co/EntropyDrop"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-[#FFD21E]/10 border border-white/10 hover:border-[#FFD21E]/30 text-white/60 hover:text-[#FFD21E] transition-all text-sm font-medium self-start group"
                                >
                                    <Icon icon="simple-icons:huggingface" className="text-xl group-hover:scale-110 transition-transform" />
                                    <span>Hugging Face</span>
                                </a>
                                <a
                                    href="https://discord.gg/ByX7TwqDcw"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-[#5865F2]/20 border border-white/10 hover:border-[#5865F2]/50 text-white/60 hover:text-white transition-all text-sm font-medium self-start group"
                                >
                                    <Icon icon="ic:baseline-discord" className="text-xl group-hover:scale-110 transition-transform" />
                                    <span>Discord</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Vision & Motivation */}
                <div className="lg:col-span-3 flex flex-col gap-6">
                    <div className="bg-gradient-to-br from-white/10 to-transparent border border-white/10 p-6 flex flex-col gap-4 hover:border-green-500/30 transition-all group shadow-lg min-h-[380px] lg:h-full">
                        <div className="flex items-center gap-3 text-blue-400 border-b border-white/5 pb-3">
                            <Icon icon="pixelarticons:eye" className="text-2xl" />
                            <h3 className={`text-base font-bold m-0 ${current.fontClass}`}>{data.vision.title}</h3>
                        </div>
                        <p className={`text-white/80 text-sm sm:text-base leading-relaxed py-2 ${current.fontClass}`}>
                            {data.vision.content}
                        </p>
                        <Link
                            to="/public/article/root-trust-governance"
                            className="flex items-center gap-2 px-3 py-1.5 bg-blue-400/10 hover:bg-blue-400/20 border border-blue-400/20 hover:border-blue-400/40 text-blue-300 hover:text-blue-200 transition-all text-sm font-mono self-start mt-auto group"
                        >
                            <span>{data.vision.moreLabel}</span>
                            <Icon icon="pixelarticons:chevron-right" className="text-base transition-transform group-hover:translate-x-0.5" />
                        </Link>

                    </div>
                </div>
            </div>

            {/* Roadmap Section */}
            <div className="border-t border-white/10 pt-6 flex flex-col gap-4 shrink-0">
                <h3 className={`text-white/80 text-base m-0 flex items-center gap-2 font-bold ${current.fontClass}`}>
                    <Icon icon="pixelarticons:chart-add" className="text-lg text-green-500" />
                    {data.roadmap.title}
                </h3>

                <div className="flex flex-col gap-8">
                    {roadmapModules.map((module, mIndex) => (
                        <div key={mIndex} className="flex flex-col gap-3">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="flex items-center gap-2">
                                    {module.icon && (
                                        <Icon
                                            icon={module.icon}
                                            className={`${module.iconColor || 'text-green-500/60'} text-sm ${module.icon === 'pixelarticons:heart' ? 'animate-pulse' : ''}`}
                                        />
                                    )}
                                    <h4 className={`text-sm font-bold ${module.iconColor ? `${module.iconColor}/80` : 'text-green-500/60'} uppercase tracking-widest ${current.fontClass}`}>
                                        {module.title}
                                    </h4>
                                </div>
                                <div className="flex-1 h-px bg-white/5" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {module.items.map((item, iIndex) => {
                                    const link = item.link;
                                    const isClickable = !!link;
                                    const isExternalLink = typeof link === 'string' && /^https?:\/\//.test(link);
                                    const statusStyle = getStatusStyle(item.status);
                                    const handleItemClick = () => {
                                        if (!link) return;
                                        if (isExternalLink) {
                                            window.open(link, '_blank', 'noopener,noreferrer');
                                            return;
                                        }
                                        navigate(link);
                                    };

                                    return (
                                        <div
                                            key={iIndex}
                                            onClick={handleItemClick}
                                            className={`bg-white/5 border border-white/10 p-4 flex flex-col gap-2 transition-all group h-full ${isClickable ? 'cursor-pointer hover:bg-white/10 hover:border-green-500/40' : 'cursor-default hover:bg-white/10 hover:border-green-500/20'}`}
                                        >
                                            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                                                <span className="text-sm font-mono text-white/30 uppercase">
                                                    {module.title.split(' ')[0]}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <div className={`w-1 h-1 rounded-full ${statusStyle.dot}`} />
                                                    <span className={`text-sm ${statusStyle.text}`}>
                                                        {item.status}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex justify-between items-start mt-1">
                                                <h4 className={`text-sm font-semibold text-white m-0 ${current.fontClass}`}>
                                                    {item.title}
                                                </h4>
                                                {isClickable && <Icon icon="pixelarticons:chevron-right" className="text-white/20 group-hover:text-green-500 transition-colors" />}
                                            </div>
                                            <p className={`text-white/50 text-sm leading-relaxed mt-1 ${current.fontClass}`}>
                                                {item.desc}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Articles Section */}
            <div className="border-t border-white/10 pt-6 flex flex-col gap-4 shrink-0">
                <h3 className={`text-white/80 text-base m-0 flex items-center gap-2 font-bold ${current.fontClass}`}>
                    <Icon icon="pixelarticons:notes" className="text-lg text-green-500" />
                    {data.articles.title}
                </h3>

                <div className="flex flex-col gap-3">
                    {articles.map((article, index) => (
                        <a
                            key={index}
                            href={`/public/article/${article.id}`}
                            className="bg-white/5 border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/10 transition-all cursor-pointer group hover:border-green-500/20"
                        >
                            <div className="flex flex-col gap-1">
                                <h4 className={`text-base font-bold text-white group-hover:text-green-400 transition-colors ${current.fontClass}`}>
                                    {article.title}
                                </h4>
                                <p className={`text-white/50 text-sm leading-relaxed ${current.fontClass}`}>
                                    {article.summary}
                                </p>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                <div className="flex gap-2">
                                    {article.tags.map((tag: string, i: number) => (
                                        <span key={i} className="text-sm font-mono text-white/40 border border-white/10 px-1.5 py-0.5 uppercase">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                                <span className="text-sm font-mono text-green-500/60 group-hover:text-green-500 transition-colors">
                                    {article.date}
                                </span>
                                <Icon icon="pixelarticons:chevron-right" className="text-lg text-white/20 group-hover:text-green-500 transition-all transform group-hover:translate-x-1" />
                            </div>
                        </a>
                    ))}
                </div>
            </div>

        </PageContainer>
    );
}
