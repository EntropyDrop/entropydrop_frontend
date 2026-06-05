import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { apiFetch } from '../utils/api'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

interface MonitorStats {
  timestamp: string;
  queue_stats: Record<string, {
    count: number;
    started_count: number;
    deferred_count: number;
    finished_count: number;
    failed_count: number;
    scheduled_count: number;
  }>;
  workers: Array<{
    name: string;
    queues: string[];
    state: string;
    current_job_id: string | null;
    last_heartbeat: string | null;
    birth_date: string | null;
    is_active: boolean;
    current_job?: {
      id: string;
      enqueued_at: string | null;
      description: string;
    }
  }>;
  summary: {
    total_workers: number;
    idle_workers: number;
    busy_workers: number;
    total_queued_tasks: number;
    total_processing_tasks: number;
    total_users: number;
    total_members: number;
  };
  history: Array<{
    date: string;
    total_users: number;
    total_pro: number;
    gen_regular: number;
    gen_pro: number;
  }>;
  history_24h: Array<{
    time: string;
    gen_regular: number;
    gen_pro: number;
  }>;
}

interface MonitorPageProps {
  current: LangData
}

export function MonitorPage({ current }: MonitorPageProps) {
  const [stats, setStats] = useState<MonitorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Unfinished logs additions
  interface UnfinishedLogItem {
    id: string;
    prompt: string | null;
    mode: string;
    status: string;
    created_at: string | null;
    user_id: string | null;
    user_email: string | null;
    user_username: string | null;
  }
  interface UnfinishedData {
    items: UnfinishedLogItem[];
    total_count: number;
    page: number;
    page_size: number;
    total_pages: number;
  }

  const [unfinishedData, setUnfinishedData] = useState<UnfinishedData | null>(null)
  const [loadingUnfinished, setLoadingUnfinished] = useState(true)
  const [page, setPage] = useState(1)
  const [now, setNow] = useState(new Date())

  // Admin delete states
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [purgeIdInput, setPurgeIdInput] = useState('')
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [isUnlimited, setIsUnlimited] = useState(false)
  const [settingLoading, setSettingLoading] = useState(false)

  const isZh = current.lang === 'zh-hans'

  const fetchStats = async () => {
    try {
      const response = await apiFetch('/api/monitor/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        setError(null)
      } else if (response.status === 403) {
        setError('Admin access required')
      } else {
        setError('Failed to fetch stats')
      }
    } catch (e) {
      setError('Connection error')
    } finally {
      setLoading(false)
    }
  }

  const fetchUnlimitedStatus = async () => {
    try {
      const response = await apiFetch('/api/monitor/unlimited')
      if (response.ok) {
        const data = await response.json()
        setIsUnlimited(data.unlimited)
      }
    } catch (e) {
      console.error('Failed to fetch unlimited quota status', e)
    }
  }

  const toggleUnlimitedStatus = async (checked: boolean) => {
    setSettingLoading(true)
    try {
      const response = await apiFetch('/api/monitor/unlimited', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unlimited: checked })
      })
      if (response.ok) {
        const data = await response.json()
        setIsUnlimited(data.unlimited)
        setDeleteMessage({
          type: 'success',
          text: isZh 
            ? (data.unlimited ? '全局不限量生成额度功能已成功开启！' : '全局生成额度不限量已关闭，已恢复正常额度检查。')
            : (data.unlimited ? 'Unlimited generation quota has been enabled globally!' : 'Unlimited generation quota disabled. Standard limits restored.')
        })
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || (isZh ? '操作失败，请重试' : 'Operation failed, please try again')
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: isZh ? '网络连接错误' : 'Network connection error'
      })
    } finally {
      setSettingLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchUnlimitedStatus()
    const timer = setInterval(fetchStats, 3000)
    return () => clearInterval(timer)
  }, [])

  const fetchUnfinished = async (p: number) => {
    try {
      const response = await apiFetch(`/api/monitor/unfinished?page=${p}&page_size=10`)
      if (response.ok) {
        const data = await response.json()
        setUnfinishedData(data)
      }
    } catch (e) {
      console.error('Failed to fetch unfinished logs', e)
    } finally {
      setLoadingUnfinished(false)
    }
  }

  useEffect(() => {
    fetchUnfinished(page)
    const timer = setInterval(() => {
      fetchUnfinished(page)
    }, 60000) // Poll every 60 seconds
    return () => clearInterval(timer)
  }, [page])

  useEffect(() => {
    const clockTimer = setInterval(() => {
      setNow(new Date())
    }, 1000) // Clock ticks every second
    return () => clearInterval(clockTimer)
  }, [])

  useEffect(() => {
    if (deleteMessage) {
      const timer = setTimeout(() => {
        setDeleteMessage(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [deleteMessage])

  const executeDelete = async (id: string) => {
    setActionLoading(true)
    try {
      const response = await apiFetch(`/api/monitor/logs/${id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setDeleteMessage({
          type: 'success',
          text: isZh ? `成功删除皮肤 ${id} 及其相关资源。` : `Skin ${id} and associated resources successfully deleted.`
        })
        setPurgeIdInput('')
        // Refresh data
        fetchStats()
        fetchUnfinished(page)
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || (isZh ? `删除失败：${response.status}` : `Deletion failed: ${response.status}`)
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: isZh ? '网络连接错误，删除操作失败。' : 'Connection error. Deletion failed.'
      })
    } finally {
      setActionLoading(false)
      setDeletingId(null)
    }
  }

  const calculateWaitTime = (createdAtStr: string | null) => {
    if (!createdAtStr) return 'N/A'
    const created = new Date(createdAtStr).getTime()
    const diff = now.getTime() - created
    if (isNaN(diff) || diff < 0) return '0s'
    
    const secs = Math.floor(diff / 1000)
    const mins = Math.floor(secs / 60)
    const hours = Math.floor(mins / 60)
    
    if (hours > 0) {
      return `${hours}h ${mins % 60}m ${secs % 60}s`
    }
    if (mins > 0) {
      return `${mins}m ${secs % 60}s`
    }
    return `${secs}s`
  }

  const getStatusBadge = (status: string) => {
    let label = status
    let classes = 'bg-white/5 border-white/10 text-white/40'
    
    if (status === 'pending' || status === 'pending_skin') {
      label = isZh ? '排队中' : 'QUEUED'
      classes = 'bg-orange-500/10 border-orange-500/30 text-orange-400'
    } else if (status === 'processing' || status === 'processing_skin') {
      label = isZh ? '生成中' : 'PROCESSING'
      classes = 'bg-green-500/10 border-green-500/30 text-green-400 font-bold'
    } else if (status === 'failed') {
      label = isZh ? '失败' : 'FAILED'
      classes = 'bg-red-500/10 border-red-500/30 text-red-400 font-bold'
    }
    
    return (
      <div className={`px-2 py-0.5 text-[10px] border font-mono rounded flex items-center gap-1.5 w-fit ${classes}`}>
        {(status === 'processing' || status === 'processing_skin') && (
          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping" />
        )}
        {label}
      </div>
    )
  }

  const getModeLabel = (mode: string) => {
    switch (mode) {
      case 'aigc_text_to_image':
        return isZh ? 'AI 文生图' : 'Text to Image'
      case 'aigc_image_to_image':
        return isZh ? 'AI 图生图' : 'Image to Image'
      case 'aigc_image_edit':
        return isZh ? 'AI 局部编辑' : 'Image Edit'
      case 'aigc_image_to_skin':
        return isZh ? 'AI 图生皮肤' : 'Image to Skin'
      case 'aigc_text_to_skin':
        return isZh ? 'AI 文生皮肤' : 'Text to Skin'
      case 'aigc_image_edit_to_skin':
        return isZh ? 'AI 编辑生皮肤' : 'Edit to Skin'
      case 'human_edit':
        return isZh ? '人类编辑' : 'Human Edit'
      case 'human_upload':
        return isZh ? '人类上传' : 'Human Upload'
      default:
        return mode
    }
  }


  if (loading && !stats) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pt-32">
        <Icon icon="pixelarticons:reload" className="text-4xl text-green-500 animate-spin" />
      </div>
    )
  }

  return (
    <PageContainer
      alignItems="items-start"
      height="h-auto"
      overflow="overflow-visible"
      animate="animate-in fade-in zoom-in duration-300"
      className="custom-scrollbar"
    >

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-white/10 pb-6 shrink-0">
          <div>
            <h1 className={`text-white text-2xl lg:text-3xl m-0 flex items-center gap-3 ${current.fontClass}`}>
              <Icon icon="pixelarticons:device-tv" className="text-green-500" />
              Monitoring Center
            </h1>
            <p className="text-white/40 text-[10px] mt-1 font-mono uppercase tracking-widest">
              Live System Status • Last sync: {stats?.timestamp ? new Date(stats.timestamp).toLocaleTimeString() : 'N/A'}
            </p>
          </div>

          <div className="flex gap-2">
            {error ? (
              <div className="px-3 py-1 bg-red-500/10 border border-red-500/20 rounded flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="text-red-500 text-[10px] uppercase font-bold tracking-tight">{error}</span>
              </div>
            ) : (
              <div className="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-500 text-[10px] uppercase font-bold tracking-tight">System Online</span>
              </div>
            )}
          </div>
        </div>

        {/* Global Settings & Operations Control */}
        <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3.5">
            <div className={`w-10 h-10 border flex items-center justify-center text-xl transition-all ${isUnlimited ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 shadow-[0_0_15px_-3px_rgba(234,179,8,0.3)]' : 'bg-white/5 border-white/10 text-white/40'}`}>
              <Icon icon="pixelarticons:gift" className={isUnlimited ? 'animate-bounce' : ''} />
            </div>
            <div className="flex flex-col gap-0.5">
              <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                {isZh ? '全局系统设置 • 活动控制' : 'Global Settings • Event Controller'}
              </h3>
              <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                {isZh ? '一键控制所有用户的生成额度限制。开启后，生成将不消耗额度且无任何限制。' : 'Toggle global quota limits. When enabled, skin generation is fully unlimited for all.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto shrink-0 animate-pulse">
            <span className={`text-[10px] sm:text-xs font-mono font-bold tracking-wider uppercase ${isUnlimited ? 'text-yellow-400' : 'text-white/30'}`}>
              {isUnlimited ? (isZh ? '全局不限量已开启' : 'UNLIMITED QUOTA ACTIVE') : (isZh ? '标准额度检查中' : 'STANDARD LIMITS ACTIVE')}
            </span>
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isUnlimited}
                disabled={settingLoading}
                onChange={(e) => toggleUnlimitedStatus(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/10 border border-white/20 peer-focus:outline-none rounded-none transition-all peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-none after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500/20 peer-checked:border-green-500/40 peer-disabled:opacity-50"></div>
            </label>
            {settingLoading && (
              <Icon icon="pixelarticons:reload" className="animate-spin text-green-500 text-sm" />
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 shrink-0">
          <StatCard
            icon="pixelarticons:group"
            label="Total Users"
            value={stats?.summary.total_users || 0}
            color="text-purple-400"
          />
          <StatCard
            icon="pixelarticons:human-handsup"
            label="Total Members"
            value={stats?.summary.total_members || 0}
            color="text-pink-400"
          />
          <StatCard
            icon="pixelarticons:contactless"
            label="Total Workers"
            value={stats?.summary.total_workers || 0}
            color="text-blue-400"
          />
          <StatCard
            icon="pixelarticons:dashboard"
            label="Busy Nodes"
            value={stats?.summary.busy_workers || 0}
            color="text-yellow-400"
          />
          <StatCard
            icon="pixelarticons:list"
            label="Queued Tasks"
            value={stats?.summary.total_queued_tasks || 0}
            color="text-orange-400"
          />
          <StatCard
            icon="pixelarticons:check"
            label="Idle Nodes"
            value={stats?.summary.idle_workers || 0}
            color="text-green-400"
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0 h-[300px]">
          <div className="bg-white/5 border border-white/10 p-4 flex flex-col gap-4">
            <h3 className={`text-white/60 text-sm m-0 flex items-center gap-2 ${current.fontClass}`}>
              <Icon icon="pixelarticons:group" /> User Growth (7 Days)
            </h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.history || []}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorPro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f472b6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f472b6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#ffffff40"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#ffffff40"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: '10px' }}
                    itemStyle={{ fontSize: '10px' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase' }} />
                  <Area
                    type="monotone"
                    dataKey="total_users"
                    name="Total Users"
                    stroke="#a78bfa"
                    fillOpacity={1}
                    fill="url(#colorUsers)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="total_pro"
                    name="Pro Users"
                    stroke="#f472b6"
                    fillOpacity={1}
                    fill="url(#colorPro)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 flex flex-col gap-4">
            <h3 className={`text-white/60 text-sm m-0 flex items-center gap-2 ${current.fontClass}`}>
              <Icon icon="pixelarticons:image" /> Daily Generations (7 Days)
            </h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.history || []}>
                  <defs>
                    <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorGenPro" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="#ffffff40"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#ffffff40"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: '10px' }}
                    itemStyle={{ fontSize: '10px' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase' }} />
                  <Area
                    type="monotone"
                    dataKey="gen_regular"
                    name="Regular Gen"
                    stroke="#60a5fa"
                    fillOpacity={1}
                    fill="url(#colorReg)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="gen_pro"
                    name="Pro Gen"
                    stroke="#34d399"
                    fillOpacity={1}
                    fill="url(#colorGenPro)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 24h Hourly Generations Chart */}
        <div className="bg-white/5 border border-white/10 p-4 flex flex-col gap-4 shrink-0 h-[250px]">
          <h3 className={`text-white/60 text-sm m-0 flex items-center gap-2 ${current.fontClass}`}>
            <Icon icon="pixelarticons:loader" /> Hourly Generations (Last 24h)
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.history_24h || []}>
                <defs>
                  <linearGradient id="colorReg24" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorPro24" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="#ffffff40"
                  fontSize={8}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#ffffff40"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: '10px' }}
                  itemStyle={{ fontSize: '10px' }}
                />
                <Legend verticalAlign="top" height={30} iconType="circle" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase' }} />
                <Area
                  type="stepAfter"
                  dataKey="gen_regular"
                  name="Reg Gen (H)"
                  stroke="#3b82f6"
                  fillOpacity={1}
                  fill="url(#colorReg24)"
                  strokeWidth={1}
                />
                <Area
                  type="stepAfter"
                  dataKey="gen_pro"
                  name="Pro Gen (H)"
                  stroke="#8b5cf6"
                  fillOpacity={1}
                  fill="url(#colorPro24)"
                  strokeWidth={1}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Queues Section */}
        <div className="shrink-0 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[450px] min-h-0">
          <div className="lg:col-span-1 flex flex-col gap-4 min-h-0 h-full">
            <h3 className={`text-white/60 text-sm m-0 flex items-center gap-2 ${current.fontClass}`}>
              <Icon icon="pixelarticons:list-box" /> Queues Status
            </h3>
            <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-1 flex-1 min-h-0">
              {stats && Object.entries(stats.queue_stats).map(([name, data]) => (
                <div key={name} className="bg-white/5 border border-white/5 p-3 flex flex-col gap-2 hover:bg-white/10 transition-colors group">
                  <div className="flex justify-between items-center">
                    <span className="text-white/80 text-[11px] font-mono group-hover:text-green-400 transition-colors">{name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 border ${data.count > 0 ? 'bg-orange-500/10 border-orange-500/30 text-orange-500' : 'bg-white/5 border-white/10 text-white/40'}`}>
                      {data.count}
                    </span>
                  </div>
                  <div className="w-full bg-white/5 h-1">
                    <div
                      className="bg-green-500 h-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (data.count / 10) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[8px] text-white/30 uppercase font-mono">
                    <span>Proc: {data.started_count}</span>
                    <span>Fail: {data.failed_count}</span>
                    <span>Fin: {data.finished_count}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0 h-full">
            <h3 className={`text-white/60 text-sm m-0 flex items-center gap-2 ${current.fontClass}`}>
              <Icon icon="pixelarticons:server" /> Active Workers (Nodes)
            </h3>
            <div className="flex flex-col gap-3 overflow-y-auto lg:flex-1 pr-2 custom-scrollbar">
              {stats?.workers && stats.workers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 bg-white/5 border border-dashed border-white/10 opacity-30">
                  <Icon icon="pixelarticons:close" className="text-4xl" />
                  <span className="text-xs mt-2">No active workers found</span>
                </div>
              ) : (
                stats?.workers.map(worker => (
                  <div key={worker.name} className={`bg-white/5 border ${worker.state === 'busy' ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/5'} p-4 flex flex-col gap-3 transition-all hover:border-white/20 ${!worker.is_active ? 'opacity-40 grayscale' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col">
                        <span className="text-white font-mono text-sm flex items-center gap-2">
                          <Icon icon="pixelarticons:human" className={worker.is_active ? "text-green-500" : "text-white/20"} />
                          {worker.name}
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {worker.queues.map(q => (
                            <span key={q} className="text-white/20 text-[8px] uppercase font-mono border border-white/5 px-1 bg-white/5">
                              {q}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className={`px-2 py-0.5 text-[9px] font-bold uppercase ${!worker.is_active ? 'bg-white/10 text-white/40' : worker.state === 'busy' ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
                          {worker.is_active ? worker.state : 'OFFLINE'}
                        </div>
                        {!worker.is_active && <span className="text-[7px] text-red-500/50 font-mono uppercase">Stale Connection</span>}
                      </div>
                    </div>

                    {worker.current_job && (
                      <div className="bg-black/40 p-3 border-l-2 border-yellow-500 animate-in slide-in-from-left-1 duration-300">
                        <div className="flex justify-between text-[9px] text-white/40 mb-1 font-mono uppercase">
                          <span className="flex items-center gap-1">
                            <Icon icon="pixelarticons:loader" className="animate-spin" />
                            Job: {worker.current_job.id.substring(0, 8)}
                          </span>
                          <span>Start: {worker.current_job.enqueued_at ? new Date(worker.current_job.enqueued_at).toLocaleTimeString() : 'N/A'}</span>
                        </div>
                        <div className="text-[11px] text-white/80 line-clamp-1 font-mono italic">
                          {worker.current_job.description}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[9px] text-white/20 font-mono border-t border-white/5 pt-2">
                      <span>UPTIME: {worker.birth_date ? calculateUptime(worker.birth_date) : 'N/A'}</span>
                      <span>HEARTBEAT: {worker.last_heartbeat ? new Date(worker.last_heartbeat).toLocaleTimeString() : 'N/A'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Unfinished Generations Section */}
        <div className="bg-white/5 border border-white/10 p-4 sm:p-6 flex flex-col gap-4 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
            <div className="flex items-center gap-2.5">
              <Icon icon="pixelarticons:loader" className="text-xl text-green-500 animate-spin" />
              <h3 className={`text-white text-base m-0 ${current.fontClass}`}>
                {isZh ? '未完成/失败的生成任务' : 'Unfinished & Failed Tasks'}
              </h3>
              {unfinishedData && (
                <span className="px-2 py-0.5 bg-green-500/10 border border-green-500/20 text-green-500 text-[10px] uppercase font-mono font-bold tracking-wider rounded">
                  {isZh ? `待处理/失败: ${unfinishedData.total_count}` : `Active/Failed: ${unfinishedData.total_count}`}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button 
                onClick={() => fetchUnfinished(page)}
                disabled={loadingUnfinished}
                className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                title={isZh ? '刷新任务列表' : 'Refresh list'}
              >
                <Icon icon="pixelarticons:reload" className={loadingUnfinished ? 'animate-spin text-green-500' : ''} />
              </button>
            </div>
          </div>

          {/* Deletion Banner Message */}
          {deleteMessage && (
            <div className={`p-3 border font-mono text-[11px] flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
              deleteMessage.type === 'success' 
                ? 'bg-green-500/10 border-green-500/30 text-green-400' 
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              <div className="flex items-center gap-2">
                <Icon icon={deleteMessage.type === 'success' ? 'pixelarticons:check' : 'pixelarticons:close'} className="text-base shrink-0" />
                <span>{deleteMessage.text}</span>
              </div>
              <button 
                onClick={() => setDeleteMessage(null)}
                className="text-white/40 hover:text-white transition-colors cursor-pointer bg-transparent border-0"
              >
                <Icon icon="pixelarticons:close" />
              </button>
            </div>
          )}

          {/* Admin Purge Terminal */}
          <div className="bg-red-500/5 border border-red-500/20 p-4 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-red-400 text-xs font-bold font-mono tracking-wide uppercase flex items-center gap-1.5">
                <Icon icon="pixelarticons:shield-attention" className="text-red-500" />
                {isZh ? '皮肤紧急清理工具 (Admin)' : 'Emergency Skin Purge (Admin)'}
              </span>
              <span className="text-white/40 text-[9px] font-mono uppercase">
                {isZh ? '输入任意 Generation Log ID 进行彻底物理删除 (清除 DB / S3)' : 'Enter any Generation Log ID for permanent DB & S3 deletion'}
              </span>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto sm:max-w-md">
              <input
                type="text"
                placeholder={isZh ? '输入 ID (如: aBcd1234Efgh5678)' : 'Enter Log ID...'}
                value={purgeIdInput}
                onChange={(e) => setPurgeIdInput(e.target.value.trim())}
                className="flex-1 min-w-[200px] h-9 px-3 bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-red-500/50 transition-colors placeholder:text-white/20"
              />
              <button
                onClick={() => {
                  if (!purgeIdInput) return
                  setDeletingId(purgeIdInput)
                }}
                disabled={!purgeIdInput || actionLoading}
                className="h-9 px-4 bg-red-950/40 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500 hover:text-white text-xs font-bold font-mono uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Icon icon="pixelarticons:trash" />
                {isZh ? '删除' : 'PURGE'}
              </button>
            </div>
          </div>

          {loadingUnfinished && !unfinishedData ? (
            <div className="flex items-center justify-center p-12 bg-white/5 border border-dashed border-white/10 opacity-30">
              <Icon icon="pixelarticons:reload" className="text-4xl text-green-500 animate-spin" />
            </div>
          ) : !unfinishedData || unfinishedData.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white/5 border border-dashed border-white/10 opacity-30">
              <Icon icon="pixelarticons:close" className="text-4xl" />
              <span className="text-xs mt-2">{isZh ? '暂无未完成或失败的生成任务' : 'No unfinished or failed tasks found'}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="w-full overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-[800px] border-collapse text-left font-mono">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-[11px] uppercase tracking-wider">
                      <th className="pb-3 pl-2 font-semibold">{isZh ? '任务 ID' : 'Task ID'}</th>
                      <th className="pb-3 font-semibold">{isZh ? '类型' : 'Mode'}</th>
                      <th className="pb-3 font-semibold">{isZh ? '状态' : 'Status'}</th>
                      <th className="pb-3 font-semibold">{isZh ? '用户信息' : 'User Info'}</th>
                      <th className="pb-3 font-semibold">{isZh ? '创建时间' : 'Created At'}</th>
                      <th className="pb-3 font-semibold text-right">{isZh ? '等待时间' : 'Wait Time'}</th>
                      <th className="pb-3 pr-2 font-semibold text-right w-20">{isZh ? '操作' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[12px] text-white/80">
                    {unfinishedData.items.map(log => (
                      <tr key={log.id} className="hover:bg-white/5 transition-colors group">
                        <td className="py-3 pl-2 text-green-400 font-bold group-hover:text-green-300 transition-colors">
                          {log.id}
                        </td>
                        <td className="py-3 text-white/70">
                          {getModeLabel(log.mode)}
                        </td>
                        <td className="py-3">
                          {getStatusBadge(log.status)}
                        </td>
                        <td className="py-3">
                          {log.user_email ? (
                            <div className="flex flex-col">
                              <span className="text-white/90">{log.user_email}</span>
                              {log.user_username && (
                                <span className="text-[10px] text-white/40">{log.user_username}</span>
                              )}
                            </div>
                          ) : log.user_id ? (
                            <span className="text-white/60">{log.user_id}</span>
                          ) : (
                            <span className="text-white/20 italic">{isZh ? '匿名' : 'Anonymous'}</span>
                          )}
                        </td>
                        <td className="py-3 text-white/40 text-[10px]">
                          {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-3 text-right text-green-400 font-bold font-mono tracking-tight">
                          {calculateWaitTime(log.created_at)}
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <button
                            onClick={() => setDeletingId(log.id)}
                            className="w-7 h-7 inline-flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:border-red-500 hover:text-white transition-all active:scale-95 rounded cursor-pointer"
                            title={isZh ? '强制删除皮肤' : 'Force Delete Skin'}
                          >
                            <Icon icon="pixelarticons:trash" className="text-sm" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {unfinishedData.total_pages > 1 && (
                <div className="flex items-center justify-between border-t border-white/5 pt-4 text-xs font-mono">
                  <div className="text-white/40">
                    {isZh ? (
                      <>共 <span className="text-white font-bold">{unfinishedData.total_count}</span> 项 • 第 <span className="text-white font-bold">{page}</span>/{unfinishedData.total_pages} 页</>
                    ) : (
                      <>Total <span className="text-white font-bold">{unfinishedData.total_count}</span> items • Page <span className="text-white font-bold">{page}</span> of {unfinishedData.total_pages}</>
                    )}
                  </div>
                  
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                      {isZh ? '上一页' : 'Prev'}
                    </button>
                    
                    {Array.from({ length: unfinishedData.total_pages }, (_, i) => i + 1)
                      .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === unfinishedData.total_pages)
                      .map((p, idx, arr) => {
                        const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                        return (
                          <div key={p} className="flex gap-1.5">
                            {showEllipsis && <span className="text-white/30 px-1">...</span>}
                            <button
                              onClick={() => setPage(p)}
                              className={`px-3 py-1 border transition-all active:scale-95 cursor-pointer ${
                                page === p
                                  ? 'bg-green-500/20 border-green-500 text-green-400 font-bold'
                                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20'
                              }`}
                            >
                              {p}
                            </button>
                          </div>
                        );
                      })}

                    <button
                      onClick={() => setPage(p => Math.min(unfinishedData.total_pages, p + 1))}
                      disabled={page === unfinishedData.total_pages}
                      className="px-3 py-1 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                      {isZh ? '下一页' : 'Next'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

      {/* Deletion Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="w-full max-w-md bg-[#0a0a0a]/90 border border-red-500/30 p-6 flex flex-col gap-6 animate-in zoom-in-95 duration-200 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 text-2xl shrink-0">
                <Icon icon="pixelarticons:shield-attention" />
              </div>
              <div className="flex flex-col gap-1">
                <h4 className={`text-white text-base m-0 ${current.fontClass}`}>
                  {isZh ? '确认要彻底物理删除吗？' : 'Confirm Permanent Purge'}
                </h4>
                <p className="text-white/60 text-xs leading-relaxed mt-1">
                  {isZh ? (
                    <>
                      您正在请求彻底物理删除皮肤 <strong>{deletingId}</strong>。
                      这将永久删除该生成日志、数据库记录，并<b>物理擦除</b> S3 中的源图与结果图文件。此操作不可逆！
                    </>
                  ) : (
                    <>
                      Are you sure you want to permanently purge skin <strong>{deletingId}</strong>?
                      This will soft-delete the database record and <b>physically erase</b> all associated source and result files from Amazon S3. This action is irreversible.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingId(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => executeDelete(deletingId)}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-950/40 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500 hover:text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                {actionLoading ? (
                  <Icon icon="pixelarticons:reload" className="animate-spin text-red-500" />
                ) : (
                  <Icon icon="pixelarticons:trash" />
                )}
                {isZh ? '确认删除' : 'CONFIRM PURGE'}
              </button>
            </div>
          </div>
        </div>
      )}

    </PageContainer>
  )
}

function StatCard({ icon, label, value, color }: { icon: string, label: string, value: number, color: string }) {
  return (
    <div className="bg-white/5 border border-white/10 p-5 flex items-center gap-4 hover:bg-white/10 transition-all hover:-translate-y-0.5 duration-300">
      <div className={`w-12 h-12 bg-white/5 flex items-center justify-center text-3xl ${color} shadow-inner`}>
        <Icon icon={icon} />
      </div>
      <div className="flex flex-col">
        <span className="text-white/40 text-[10px] uppercase font-mono tracking-wider">{label}</span>
        <span className="text-white text-2xl font-bold font-mono tracking-tight">{value}</span>
      </div>
    </div>
  )
}

function calculateUptime(birthDate: string) {
  const born = new Date(birthDate).getTime()
  const now = new Date().getTime()
  const diff = now - born

  if (isNaN(diff)) return 'N/A'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
