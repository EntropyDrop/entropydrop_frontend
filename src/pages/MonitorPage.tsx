import { PageContainer } from '../components/PageContainer';
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import { type LangData } from '../constants/lang'
import { apiFetch } from '../utils/api'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line
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
    active_users: number;
    gen_regular: number;
    gen_pro: number;
  }>;
  history_24h: Array<{
    time: string;
    gen_regular: number;
    gen_pro: number;
  }>;
}

interface BackendInstance {
  instance_id: string;
  display_name: string;
  hostname: string;
  cluster: string | null;
  availability_zone: string | null;
  task_family: string | null;
  task_revision: string | null;
  runtime_status: string;
  git_commit: string;
  deploy_time: string;
  started_at: string;
  last_heartbeat: string;
  heartbeat_age_seconds: number;
  status: 'healthy' | 'unhealthy' | 'stale';
  readiness: 'ready' | 'not_ready';
  dependencies: Record<string, string>;
  cpu: {
    percent: number | null;
    allocated_vcpus: number | null;
  };
  memory: {
    used_bytes: number | null;
    limit_bytes: number | null;
    percent: number | null;
  };
  disk: {
    used_bytes: number | null;
    limit_bytes: number | null;
    percent: number | null;
  };
}

interface BackendInstancesData {
  timestamp: string;
  healthy_count: number;
  total_instances: number;
  instances: BackendInstance[];
}

interface BackendHistorySample {
  timestamp: string;
  instance_id: string;
  display_name: string;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  status: 'healthy' | 'unhealthy';
}

interface BackendHistoryData {
  timestamp: string;
  hours: number;
  bucket_seconds: number;
  series: Array<{
    instance_id: string;
    display_name: string;
    samples: BackendHistorySample[];
  }>;
}

interface MonitorPageProps {
  current: LangData
}

export function MonitorPage({ current }: MonitorPageProps) {
  const [stats, setStats] = useState<MonitorStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [backendInstances, setBackendInstances] = useState<BackendInstancesData | null>(null)
  const [backendInstancesLoading, setBackendInstancesLoading] = useState(true)
  const [backendInstancesError, setBackendInstancesError] = useState(false)
  const [backendHistory, setBackendHistory] = useState<BackendHistoryData | null>(null)
  const [backendHistoryLoading, setBackendHistoryLoading] = useState(true)
  const [backendHistoryError, setBackendHistoryError] = useState(false)

  // Unfinished logs additions
  interface UnfinishedLogItem {
    id: string;
    prompt: string | null;
    mode: string;
    status: string;
    error_msg: string | null;
    model_version: string | null;
    aux_model_version: string | null;
    created_at: string | null;
    user_id: string | null;
    user_email: string | null;
    user_username: string | null;
    provider_submission_state: string | null;
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
  const [selectedErrorMsg, setSelectedErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Admin delete states
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [purgeIdInput, setPurgeIdInput] = useState('')
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null)
  const [purgeEmailInput, setPurgeEmailInput] = useState('')
  const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [dailyFreeCredits, setDailyFreeCredits] = useState<number>(6)
  const [freeCreditsLoading, setFreeCreditsLoading] = useState(false)

  const [isTextToSkinEnabled, setIsTextToSkinEnabled] = useState(true)
  const [textToSkinSettingLoading, setTextToSkinSettingLoading] = useState(false)
  const [isImageToSkinEnabled, setIsImageToSkinEnabled] = useState(true)
  const [imageToSkinSettingLoading, setImageToSkinSettingLoading] = useState(false)
  const [isImageEditToSkinEnabled, setIsImageEditToSkinEnabled] = useState(true)
  const [imageEditToSkinSettingLoading, setImageEditToSkinSettingLoading] = useState(false)
  const [modelPrices, setModelPrices] = useState<Record<string, { credits: number; is_pro: boolean; under_maintenance: boolean }>>({})
  const [modelPricesLoading, setModelPricesLoading] = useState(false)

  // Gift Credits to All states
  const [giftAmount, setGiftAmount] = useState<number>(10)
  const [giftMessageInput, setGiftMessageInput] = useState<string>('')
  const [giftLoading, setGiftLoading] = useState(false)
  const [showGiftConfirmation, setShowGiftConfirmation] = useState(false)

  // Gift Credits to Specific User states
  const [singleGiftEmail, setSingleGiftEmail] = useState<string>('')
  const [singleGiftAmount, setSingleGiftAmount] = useState<number>(10)
  const [singleGiftMessage, setSingleGiftMessage] = useState<string>('')
  const [singleGiftLoading, setSingleGiftLoading] = useState(false)
  const [showSingleGiftConfirmation, setShowSingleGiftConfirmation] = useState(false)


  // SKING_DDJ generations states
  interface SkingDdjLogItem {
    id: string;
    prompt: string | null;
    mode: string;
    status: string;
    model_version: string;
    provider_task_id: string | null;
    provider_submission_state: string | null;
    error_msg: string | null;
    created_at: string | null;
    source_url: string | null;
    edited_image_url: string | null;
    result_url: string | null;
  }
  interface SkingDdjData {
    items: SkingDdjLogItem[];
    total_count: number;
    page: number;
    page_size: number;
    total_pages: number;
  }

  const [showSkingDdjModal, setShowSkingDdjModal] = useState(false)
  const [skingDdjData, setSkingDdjData] = useState<SkingDdjData | null>(null)
  const [loadingSkingDdj, setLoadingSkingDdj] = useState(false)
  const [skingDdjPage, setSkingDdjPage] = useState(1)

  const isZh = current.lang === 'zh-hans'

  const fetchStats = async () => {
    try {
      const response = await apiFetch('/api/monitor/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data)
        setError(null)
      } else if (response.status === 403) {
        setError(current.monitor.adminAccessRequired)
      } else {
        setError(current.monitor.failedFetchStats)
      }
    } catch (e) {
      setError(current.monitor.connectionError)
    } finally {
      setLoading(false)
    }
  }

  const fetchBackendInstances = async () => {
    setBackendInstancesLoading(true)
    try {
      const response = await apiFetch('/api/monitor/backend-instances')
      if (!response.ok) throw new Error(`Backend monitor returned ${response.status}`)
      setBackendInstances(await response.json())
      setBackendInstancesError(false)
    } catch (e) {
      console.error('Failed to fetch backend instances', e)
      setBackendInstancesError(true)
    } finally {
      setBackendInstancesLoading(false)
    }
  }

  const fetchBackendHistory = async () => {
    setBackendHistoryLoading(true)
    try {
      const response = await apiFetch('/api/monitor/backend-instances/history')
      if (!response.ok) throw new Error(`Backend history returned ${response.status}`)
      setBackendHistory(await response.json())
      setBackendHistoryError(false)
    } catch (e) {
      console.error('Failed to fetch backend instance history', e)
      setBackendHistoryError(true)
    } finally {
      setBackendHistoryLoading(false)
    }
  }



  const fetchDailyFreeCredits = async () => {
    try {
      const response = await apiFetch('/api/monitor/daily_free_credits')
      if (response.ok) {
        const data = await response.json()
        setDailyFreeCredits(data.credits)
      }
    } catch (e) {
      console.error('Failed to fetch daily free credits', e)
    }
  }

  const updateDailyFreeCredits = async (value: number) => {
    setFreeCreditsLoading(true)
    try {
      const response = await apiFetch('/api/monitor/daily_free_credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: value })
      })
      if (response.ok) {
        const data = await response.json()
        setDailyFreeCredits(data.credits)
        setDeleteMessage({
          type: 'success',
          text: isZh ? `成功更新每日免费版额度为 ${data.credits} Credits。` : `Daily free credits updated to ${data.credits}.`
        })
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || current.monitor.operationFailed
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: current.monitor.networkError
      })
    } finally {
      setFreeCreditsLoading(false)
    }
  }



  const fetchModelPrices = async () => {
    setModelPricesLoading(true)
    try {
      const response = await apiFetch('/api/monitor/model_prices')
      if (response.ok) {
        const data = await response.json()
        setModelPrices(data)
      }
    } catch (e) {
      console.error('Failed to fetch model prices', e)
    } finally {
      setModelPricesLoading(false)
    }
  }

  const updateModelPrice = async (modelName: string, value: number, isPro: boolean, underMaintenance: boolean) => {
    setModelPricesLoading(true)
    try {
      const response = await apiFetch('/api/monitor/model_prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: modelName, credits: value, is_pro: isPro, under_maintenance: underMaintenance })
      })
      if (response.ok) {
        const data = await response.json()
        setModelPrices(prev => ({
          ...prev,
          [modelName]: { credits: data.credits, is_pro: data.is_pro, under_maintenance: data.under_maintenance }
        }))
        const maintenanceStr = data.under_maintenance ? (isZh ? ' (维护中)' : ' (Under Maintenance)') : ''
        setDeleteMessage({
          type: 'success',
          text: isZh 
            ? `成功将模型 ${modelName} 配置更新为 ${data.credits} Credits${data.is_pro ? ' (PRO专属)' : ''}${maintenanceStr}。` 
            : `Model ${modelName} config updated to ${data.credits} credits${data.is_pro ? ' (PRO Only)' : ''}${maintenanceStr}.`
        })
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || current.monitor.operationFailed
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: current.monitor.networkError
      })
    } finally {
      setModelPricesLoading(false)
    }
  }

  const executeActiveUserGift = async () => {
    if (giftAmount <= 0) {
      setDeleteMessage({
        type: 'error',
        text: isZh ? '赠送额度必须大于 0' : 'Gift amount must be greater than 0'
      })
      return
    }
    if (!giftMessageInput.trim()) {
      setDeleteMessage({
        type: 'error',
        text: isZh ? '必须填写赠送备注信息' : 'Gift message/reason is required'
      })
      return
    }

    setGiftLoading(true)
    setShowGiftConfirmation(false)
    try {
      const response = await apiFetch('/api/monitor/gift_active_users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: giftAmount,
          message: giftMessageInput.trim()
        })
      })
      if (response.ok) {
        const data = await response.json()
        setDeleteMessage({
          type: 'success',
          text: isZh 
            ? `成功向 ${data.gifted_users} 位近 7 日活跃用户赠送 ${giftAmount} Credits，备注: ${giftMessageInput.trim()}`
            : `Successfully gifted ${giftAmount} credits to ${data.gifted_users} seven-day active users. Reason: ${giftMessageInput.trim()}`
        })
        setGiftMessageInput('')
        fetchStats()
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || current.monitor.operationFailed
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: current.monitor.networkError
      })
    } finally {
      setGiftLoading(false)
    }
  }

  const executeSingleGift = async () => {
    if (!singleGiftEmail.trim()) {
      setDeleteMessage({
        type: 'error',
        text: isZh ? '必须填写用户邮箱' : 'User email is required'
      })
      return
    }
    if (singleGiftAmount <= 0) {
      setDeleteMessage({
        type: 'error',
        text: isZh ? '赠送额度必须大于 0' : 'Gift amount must be greater than 0'
      })
      return
    }
    if (!singleGiftMessage.trim()) {
      setDeleteMessage({
        type: 'error',
        text: isZh ? '必须填写赠送备注信息' : 'Gift message/reason is required'
      })
      return
    }

    setSingleGiftLoading(true)
    setShowSingleGiftConfirmation(false)
    try {
      const response = await apiFetch('/api/monitor/gift_specific_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: singleGiftEmail.trim(),
          amount: singleGiftAmount,
          message: singleGiftMessage.trim()
        })
      })
      if (response.ok) {
        const data = await response.json()
        setDeleteMessage({
          type: 'success',
          text: isZh 
            ? `成功向用户 ${data.username} (${data.email}) 赠送 ${singleGiftAmount} Credits，当前余额: ${data.new_credits}`
            : `Successfully gifted ${singleGiftAmount} credits to user ${data.username} (${data.email}). New balance: ${data.new_credits}`
        })
        setSingleGiftEmail('')
        setSingleGiftMessage('')
        fetchStats()
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || current.monitor.operationFailed
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: current.monitor.networkError
      })
    } finally {
      setSingleGiftLoading(false)
    }
  }

  const fetchModesStatus = async () => {
    try {
      const response = await apiFetch('/api/monitor/mode_status')
      if (response.ok) {
        const data = await response.json()
        setIsTextToSkinEnabled(data.text_to_skin_enabled)
        setIsImageToSkinEnabled(data.image_to_skin_enabled)
        setIsImageEditToSkinEnabled(data.image_edit_to_skin_enabled)
      }
    } catch (e) {
      console.error('Failed to fetch mode status', e)
    }
  }

  const toggleModeStatus = async (mode: 'text_to_skin' | 'image_to_skin' | 'image_edit_to_skin', checked: boolean) => {
    if (mode === 'text_to_skin') setTextToSkinSettingLoading(true)
    else if (mode === 'image_to_skin') setImageToSkinSettingLoading(true)
    else if (mode === 'image_edit_to_skin') setImageEditToSkinSettingLoading(true)

    try {
      const response = await apiFetch(`/api/monitor/mode_status/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: checked })
      })
      if (response.ok) {
        const data = await response.json()
        let successMsg = ''
        if (mode === 'text_to_skin') {
          setIsTextToSkinEnabled(data.enabled)
          successMsg = data.enabled ? current.monitor.textToSkinEnabledMsg : current.monitor.textToSkinDisabledMsg
        } else if (mode === 'image_to_skin') {
          setIsImageToSkinEnabled(data.enabled)
          successMsg = data.enabled ? current.monitor.imageToSkinEnabledMsg : current.monitor.imageToSkinDisabledMsg
        } else if (mode === 'image_edit_to_skin') {
          setIsImageEditToSkinEnabled(data.enabled)
          successMsg = data.enabled ? current.monitor.imageEditToSkinEnabledMsg : current.monitor.imageEditToSkinDisabledMsg
        }

        setDeleteMessage({
          type: 'success',
          text: successMsg
        })
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || current.monitor.operationFailed
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: current.monitor.networkError
      })
    } finally {
      if (mode === 'text_to_skin') setTextToSkinSettingLoading(false)
      else if (mode === 'image_to_skin') setImageToSkinSettingLoading(false)
      else if (mode === 'image_edit_to_skin') setImageEditToSkinSettingLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchModesStatus()
    fetchDailyFreeCredits()
    fetchModelPrices()
    const timer = setInterval(fetchStats, 3000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetchBackendInstances()
    const timer = setInterval(fetchBackendInstances, 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetchBackendHistory()
    const timer = setInterval(fetchBackendHistory, 60000)
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

  const fetchSkingDdj = async (p: number) => {
    setLoadingSkingDdj(true)
    try {
      const response = await apiFetch(`/api/monitor/sking_ddj_generations?page=${p}&page_size=5`)
      if (response.ok) {
        const data = await response.json()
        setSkingDdjData(data)
      }
    } catch (e) {
      console.error('Failed to fetch SKING_DDJ generations', e)
    } finally {
      setLoadingSkingDdj(false)
    }
  }

  useEffect(() => {
    if (showSkingDdjModal) {
      fetchSkingDdj(skingDdjPage)
    }
  }, [skingDdjPage, showSkingDdjModal])

  const handleOpenSkingDdjModal = () => {
    setSkingDdjPage(1)
    setShowSkingDdjModal(true)
  }

  const downloadImage = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to opening in new tab
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.target = '_blank';
      link.click();
    }
  };

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

  const executeUserDelete = async (email: string) => {
    setActionLoading(true)
    try {
      const response = await apiFetch(`/api/monitor/users/by-email?email=${encodeURIComponent(email)}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        setDeleteMessage({
          type: 'success',
          text: current.monitor.deleteUserSuccess.replace('{email}', email)
        })
        setPurgeEmailInput('')
        // Refresh stats
        fetchStats()
      } else {
        const errData = await response.json().catch(() => ({}))
        setDeleteMessage({
          type: 'error',
          text: errData.detail || (current.monitor.deleteUserFailed + response.status)
        })
      }
    } catch (e) {
      setDeleteMessage({
        type: 'error',
        text: current.monitor.networkError
      })
    } finally {
      setActionLoading(false)
      setDeletingEmail(null)
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
      label = current.monitor.statusQueued
      classes = 'bg-orange-500/10 border-orange-500/30 text-orange-400'
    } else if (status === 'processing' || status === 'processing_skin') {
      label = current.monitor.statusProcessing
      classes = 'bg-green-500/10 border-green-500/30 text-green-400 font-bold'
    } else if (status === 'failed') {
      label = current.monitor.statusFailed
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
        return current.monitor.modeTextToImage
      case 'aigc_image_to_image':
        return current.monitor.modeImageToImage
      case 'aigc_image_edit':
        return current.monitor.modeImageEdit
      case 'aigc_image_to_skin':
        return current.monitor.modeImageToSkin
      case 'aigc_text_to_skin':
        return current.monitor.modeTextToSkin
      case 'aigc_image_edit_to_skin':
        return current.monitor.modeEditToSkin
      case 'human_edit':
        return current.monitor.modeHumanEdit
      case 'human_upload':
        return current.monitor.modeHumanUpload
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
              {current.monitor.liveSystemStatus}{stats?.timestamp ? new Date(stats.timestamp).toLocaleTimeString() : 'N/A'}
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
                <span className="text-green-500 text-[10px] uppercase font-bold tracking-tight">{current.monitor.systemOnline}</span>
              </div>
            )}
          </div>
        </div>

        {/* Backend API instance resources */}
        <section className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col gap-4 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xl">
                <Icon icon="pixelarticons:server" />
              </div>
              <div>
                <h2 className={`text-white text-sm sm:text-base m-0 ${current.fontClass}`}>
                  {isZh ? '后端 API 实例资源' : 'Backend API Instance Resources'}
                </h2>
                <p className="text-white/35 text-[9px] sm:text-[10px] mt-1 font-mono uppercase tracking-wider">
                  {isZh ? '每个运行实例的 CPU、内存与磁盘占用' : 'CPU, memory and disk utilization for every running instance'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <div className={`px-2.5 py-1 border flex items-center gap-2 font-mono text-[10px] font-bold uppercase ${
                backendInstancesError
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : backendInstances && backendInstances.total_instances > 0 && backendInstances.healthy_count === backendInstances.total_instances
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  backendInstancesError
                    ? 'bg-red-400'
                    : backendInstances && backendInstances.total_instances > 0 && backendInstances.healthy_count === backendInstances.total_instances
                      ? 'bg-green-400 animate-pulse'
                      : 'bg-yellow-400'
                }`} />
                {backendInstancesError
                  ? (isZh ? '读取失败' : 'Unavailable')
                  : `${backendInstances?.healthy_count ?? 0}/${backendInstances?.total_instances ?? 0} ${isZh ? '健康' : 'Healthy'}`}
              </div>
              <button
                onClick={fetchBackendInstances}
                disabled={backendInstancesLoading}
                className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                title={isZh ? '刷新实例资源' : 'Refresh instance resources'}
              >
                <Icon icon="pixelarticons:reload" className={backendInstancesLoading ? 'animate-spin text-cyan-400' : ''} />
              </button>
            </div>
          </div>

          {backendInstancesLoading && !backendInstances ? (
            <div className="h-36 flex items-center justify-center border border-dashed border-white/10 text-white/30">
              <Icon icon="pixelarticons:reload" className="animate-spin text-2xl text-cyan-400" />
            </div>
          ) : backendInstances?.instances.length ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {backendInstances.instances.map(instance => (
                <article
                  key={instance.instance_id}
                  className={`border p-4 flex flex-col gap-4 transition-colors ${
                    instance.status === 'healthy'
                      ? 'bg-black/20 border-white/10 hover:border-cyan-500/30'
                      : instance.status === 'unhealthy'
                        ? 'bg-red-500/5 border-red-500/30'
                        : 'bg-yellow-500/5 border-yellow-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon
                          icon="pixelarticons:server"
                          className={instance.status === 'healthy'
                            ? 'text-cyan-400 shrink-0'
                            : instance.status === 'unhealthy'
                              ? 'text-red-400 shrink-0'
                              : 'text-yellow-400 shrink-0'}
                        />
                        <span className="font-mono text-sm text-white truncate">{instance.display_name}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[9px] text-white/35 font-mono uppercase">
                        <span>{instance.availability_zone || (isZh ? '本地环境' : 'Local')}</span>
                        {instance.task_family && (
                          <span>{instance.task_family}:{instance.task_revision || '?'}</span>
                        )}
                        <span>{isZh ? '运行' : 'Uptime'} {calculateUptime(instance.started_at)}</span>
                        {instance.git_commit && instance.git_commit !== 'unknown' && (
                          <span>Commit {instance.git_commit.slice(0, 8)}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[9px] font-bold font-mono uppercase shrink-0 ${
                      instance.status === 'healthy'
                        ? 'bg-green-500/15 text-green-400'
                        : instance.status === 'unhealthy'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-yellow-500/15 text-yellow-400'
                    }`}>
                      {instance.status === 'healthy'
                        ? (isZh ? '健康' : 'Healthy')
                        : instance.status === 'unhealthy'
                          ? (isZh ? '异常' : 'Unhealthy')
                          : (isZh ? '心跳延迟' : 'Stale')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <ResourceMeter
                      label="CPU"
                      icon="pixelarticons:speed-fast"
                      percent={instance.cpu.percent}
                      detail={instance.cpu.allocated_vcpus
                        ? `${instance.cpu.allocated_vcpus} vCPU`
                        : (isZh ? '配额未知' : 'Limit unknown')}
                    />
                    <ResourceMeter
                      label={isZh ? '内存' : 'Memory'}
                      icon="pixelarticons:chip"
                      percent={instance.memory.percent}
                      detail={formatUsage(instance.memory.used_bytes, instance.memory.limit_bytes)}
                    />
                    <ResourceMeter
                      label={isZh ? '磁盘' : 'Disk'}
                      icon="pixelarticons:save"
                      percent={instance.disk.percent}
                      detail={formatUsage(instance.disk.used_bytes, instance.disk.limit_bytes)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white/5 pt-2 text-[8px] text-white/25 font-mono uppercase">
                    <span className="truncate">{instance.hostname}</span>
                    <div className="flex items-center gap-2">
                      {Object.entries(instance.dependencies || {}).map(([name, value]) => (
                        <span key={name} className={value === 'ok' ? 'text-green-500/60' : 'text-red-400'}>
                          {name} {value === 'ok' ? 'OK' : 'ERROR'}
                        </span>
                      ))}
                    </div>
                    <span className="shrink-0">
                      {isZh ? '心跳' : 'Heartbeat'} {formatHeartbeatAge(instance.heartbeat_age_seconds, isZh)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="h-36 flex flex-col items-center justify-center border border-dashed border-white/10 text-white/30 gap-2">
              <Icon icon="pixelarticons:server" className="text-3xl" />
              <span className="text-[10px] font-mono uppercase tracking-wider">
                {backendInstancesError
                  ? (isZh ? '暂时无法读取实例指标' : 'Instance metrics are temporarily unavailable')
                  : (isZh ? '等待实例首次上报指标' : 'Waiting for the first instance heartbeat')}
              </span>
            </div>
          )}

          <div className="border-t border-white/5 pt-4 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className={`text-white/70 text-sm m-0 flex items-center gap-2 ${current.fontClass}`}>
                  <Icon icon="pixelarticons:chart" className="text-cyan-400" />
                  {isZh ? '资源占用趋势 • 最近 12 小时' : 'Resource Utilization • Last 12 Hours'}
                </h3>
                <p className="text-white/25 text-[9px] mt-1 font-mono uppercase tracking-wider">
                  {isZh ? '每 5 分钟一个采样点，多实例分别显示' : 'Five-minute samples, shown separately for every instance'}
                </p>
              </div>
              <button
                onClick={fetchBackendHistory}
                disabled={backendHistoryLoading}
                className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shrink-0"
                title={isZh ? '刷新历史趋势' : 'Refresh history charts'}
              >
                <Icon icon="pixelarticons:reload" className={backendHistoryLoading ? 'animate-spin text-cyan-400' : ''} />
              </button>
            </div>

            {backendHistoryLoading && !backendHistory ? (
              <div className="h-48 flex items-center justify-center border border-dashed border-white/10">
                <Icon icon="pixelarticons:reload" className="animate-spin text-2xl text-cyan-400" />
              </div>
            ) : backendHistory?.series.some(series => series.samples.length > 0) ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <BackendHistoryChart
                  title="CPU"
                  icon="pixelarticons:speed-fast"
                  metric="cpu_percent"
                  history={backendHistory}
                />
                <BackendHistoryChart
                  title={isZh ? '内存' : 'Memory'}
                  icon="pixelarticons:chip"
                  metric="memory_percent"
                  history={backendHistory}
                />
                <BackendHistoryChart
                  title={isZh ? '磁盘' : 'Disk'}
                  icon="pixelarticons:save"
                  metric="disk_percent"
                  history={backendHistory}
                />
              </div>
            ) : (
              <div className="h-48 flex flex-col items-center justify-center border border-dashed border-white/10 text-white/30 gap-2">
                <Icon icon="pixelarticons:chart" className="text-3xl" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-center px-4">
                  {backendHistoryError
                    ? (isZh ? '暂时无法读取历史指标' : 'Historical metrics are temporarily unavailable')
                    : (isZh ? '历史数据将在部署后逐步积累' : 'Historical data will accumulate after deployment')}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Global Settings & Operations Control */}
        <div className="flex flex-col gap-4 shrink-0">

          {/* Text to Skin Maintenance Switch */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5">
              <div className={`w-10 h-10 border flex items-center justify-center text-xl transition-all ${!isTextToSkinEnabled ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                <Icon icon="pixelarticons:slider" className="" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {current.monitor.textToSkinToggleTitle}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {current.monitor.textToSkinToggleDesc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
              <span className={`text-[10px] sm:text-xs font-mono font-bold tracking-wider uppercase ${!isTextToSkinEnabled ? 'text-red-400' : 'text-green-400'}`}>
                {!isTextToSkinEnabled ? current.monitor.underMaintenance : current.monitor.operational}
              </span>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!isTextToSkinEnabled}
                  disabled={textToSkinSettingLoading}
                  onChange={(e) => toggleModeStatus('text_to_skin', !e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 border border-white/20 peer-focus:outline-none rounded-none transition-all peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-none after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500/20 peer-checked:border-red-500/40 peer-disabled:opacity-50"></div>
              </label>
              {textToSkinSettingLoading && (
                <Icon icon="pixelarticons:reload" className="animate-spin text-green-500 text-sm" />
              )}
            </div>
          </div>

          {/* Image to Skin Maintenance Switch */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5">
              <div className={`w-10 h-10 border flex items-center justify-center text-xl transition-all ${!isImageToSkinEnabled ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                <Icon icon="pixelarticons:slider" className="" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {current.monitor.imageToSkinToggleTitle}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {current.monitor.imageToSkinToggleDesc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
              <span className={`text-[10px] sm:text-xs font-mono font-bold tracking-wider uppercase ${!isImageToSkinEnabled ? 'text-red-400' : 'text-green-400'}`}>
                {!isImageToSkinEnabled ? current.monitor.underMaintenance : current.monitor.operational}
              </span>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!isImageToSkinEnabled}
                  disabled={imageToSkinSettingLoading}
                  onChange={(e) => toggleModeStatus('image_to_skin', !e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 border border-white/20 peer-focus:outline-none rounded-none transition-all peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-none after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500/20 peer-checked:border-red-500/40 peer-disabled:opacity-50"></div>
              </label>
              {imageToSkinSettingLoading && (
                <Icon icon="pixelarticons:reload" className="animate-spin text-green-500 text-sm" />
              )}
            </div>
          </div>

          {/* Edit to Skin Maintenance Switch */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5">
              <div className={`w-10 h-10 border flex items-center justify-center text-xl transition-all ${!isImageEditToSkinEnabled ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                <Icon icon="pixelarticons:slider" className="" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {current.monitor.imageEditToSkinToggleTitle}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {current.monitor.imageEditToSkinToggleDesc}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
              <span className={`text-[10px] sm:text-xs font-mono font-bold tracking-wider uppercase ${!isImageEditToSkinEnabled ? 'text-red-400' : 'text-green-400'}`}>
                {!isImageEditToSkinEnabled ? current.monitor.underMaintenance : current.monitor.operational}
              </span>
              <label className="relative inline-flex items-center cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!isImageEditToSkinEnabled}
                  disabled={imageEditToSkinSettingLoading}
                  onChange={(e) => toggleModeStatus('image_edit_to_skin', !e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 border border-white/20 peer-focus:outline-none rounded-none transition-all peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-none after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500/20 peer-checked:border-red-500/40 peer-disabled:opacity-50"></div>
              </label>
              {imageEditToSkinSettingLoading && (
                <Icon icon="pixelarticons:reload" className="animate-spin text-green-500 text-sm" />
              )}
            </div>
          </div>

          {/* Daily Free Credits Configuration Card */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5">
              <div className={`w-10 h-10 border flex items-center justify-center text-xl transition-all bg-green-500/10 border-green-500/30 text-green-400`}>
                <Icon icon="pixelarticons:coin" className="" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {isZh ? '每日登录领取额度 • 算力控制' : 'Daily Login Credits • Compute Control'}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {isZh ? '设置所有用户每天登录领取的 Credit 额度。' : 'Set the number of credits daily login awards to all users.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={dailyFreeCredits}
                  onChange={(e) => setDailyFreeCredits(parseInt(e.target.value) || 0)}
                  className="w-16 px-2.5 py-1 text-center bg-black/40 border border-white/20 text-white font-mono text-sm focus:outline-none focus:border-green-500/50"
                  disabled={freeCreditsLoading}
                />
                <button
                  onClick={() => updateDailyFreeCredits(dailyFreeCredits)}
                  disabled={freeCreditsLoading}
                  className="px-3 py-1 bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30 hover:border-green-500/50 transition-colors text-xs font-bold font-mono tracking-wide flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {freeCreditsLoading ? (
                    <Icon icon="pixelarticons:reload" className="animate-spin text-sm" />
                  ) : (
                    <Icon icon="pixelarticons:check" className="text-sm" />
                  )}
                  {isZh ? '保存' : 'SAVE'}
                </button>
              </div>
            </div>
          </div>



          {/* Model Specific Pricing Configuration Card */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 border flex items-center justify-center text-xl transition-all bg-blue-500/10 border-blue-500/30 text-blue-400">
                <Icon icon="pixelarticons:sliders" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {isZh ? '模型单独定价 • Model Specific Pricing' : 'Model Specific Pricing'}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {isZh ? '设置特定模型每次生成单独消耗的 Credits。留空或未设置时默认使用全局单次生成消耗。' : 'Set custom generation cost in Credits for specific models. Uses global default cost if unset.'}
                </p>
              </div>
            </div>

            <div className="border border-white/10 bg-black/20 p-3 sm:p-4 flex flex-col gap-3 font-mono">
              {modelPricesLoading ? (
                <div className="text-white/40 text-xs py-2 flex items-center gap-2">
                  <Icon icon="pixelarticons:reload" className="animate-spin" />
                  {isZh ? '正在读取模型价格...' : 'Loading model prices...'}
                </div>
              ) : Object.keys(modelPrices).length === 0 ? (
                <div className="text-white/40 text-xs py-2">
                  {isZh ? '未找到可用模型' : 'No models available'}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {Object.keys(modelPrices).map((modelName) => (
                    <div key={modelName} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-white/80 text-xs truncate max-w-full sm:max-w-[300px]">
                          {modelName}
                        </span>
                        <div className="flex flex-row gap-1">
                          {modelPrices[modelName]?.is_pro && (
                            <span className="text-[9px] bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-1 py-0.5 rounded self-start mt-0.5 font-bold uppercase tracking-wider scale-90 origin-left">
                              PRO ONLY
                            </span>
                          )}
                          {modelPrices[modelName]?.under_maintenance && (
                            <span className="text-[9px] bg-red-500/10 border border-red-500/20 text-red-500 px-1 py-0.5 rounded self-start mt-0.5 font-bold uppercase tracking-wider scale-90 origin-left">
                              {isZh ? '维护中' : 'MAINTENANCE'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3.5 self-end sm:self-auto shrink-0 flex-wrap sm:flex-nowrap justify-end">
                        <div className="flex items-center gap-1">
                          <span className="text-white/40 text-[10px] uppercase mr-1">Cost:</span>
                          <input
                            type="number"
                            min="0"
                            max="1000"
                            value={modelPrices[modelName]?.credits ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : (parseInt(e.target.value) || 0);
                              setModelPrices(prev => ({
                                ...prev,
                                [modelName]: { ...prev[modelName], credits: val }
                              }));
                            }}
                            className="w-16 px-2 py-0.5 text-center bg-black/40 border border-white/20 text-white text-xs focus:outline-none focus:border-blue-500/50"
                          />
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/40 text-[10px] uppercase">{isZh ? 'PRO专属' : 'PRO ONLY'}:</span>
                          <button
                            onClick={() => {
                              const currentVal = modelPrices[modelName];
                              if (currentVal) {
                                setModelPrices(prev => ({
                                  ...prev,
                                  [modelName]: { ...prev[modelName], is_pro: !currentVal.is_pro }
                                }));
                              }
                            }}
                            className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer flex items-center ${
                              modelPrices[modelName]?.is_pro ? 'bg-yellow-500 justify-end' : 'bg-white/10 justify-start'
                            }`}
                          >
                            <div className="w-3 h-3 rounded-full bg-black" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-white/40 text-[10px] uppercase">{isZh ? '维护中' : 'MAINTENANCE'}:</span>
                          <button
                            onClick={() => {
                              const currentVal = modelPrices[modelName];
                              if (currentVal) {
                                setModelPrices(prev => ({
                                  ...prev,
                                  [modelName]: { ...prev[modelName], under_maintenance: !currentVal.under_maintenance }
                                }));
                              }
                            }}
                            className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none cursor-pointer flex items-center ${
                              modelPrices[modelName]?.under_maintenance ? 'bg-red-500 justify-end' : 'bg-white/10 justify-start'
                            }`}
                          >
                            <div className="w-3 h-3 rounded-full bg-black" />
                          </button>
                        </div>

                        <button
                          onClick={() => updateModelPrice(
                            modelName, 
                            modelPrices[modelName]?.credits || 0, 
                            modelPrices[modelName]?.is_pro || false,
                            modelPrices[modelName]?.under_maintenance || false
                          )}
                          className="px-2.5 py-0.5 bg-blue-500/20 border border-blue-500/40 text-blue-400 hover:bg-blue-500/30 hover:border-blue-500/50 transition-colors text-[10px] font-bold tracking-wide flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Icon icon="pixelarticons:check" className="text-xs" />
                          {isZh ? '保存' : 'SAVE'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Gift Credits to Seven-Day Active Users Panel */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5 flex-1 w-full">
              <div className="w-10 h-10 border flex items-center justify-center text-xl bg-purple-500/10 border-purple-500/30 text-purple-400 shrink-0">
                <Icon icon="pixelarticons:gift" />
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {isZh ? '7 日活跃用户 Credits 赠送 • 运营活动' : '7-Day Active User Credits • Campaigns'}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {isZh ? '向近 7 个 UTC 自然日内至少登录一次的用户赠送 Credits，并发送系统通知。' : 'Gift credits and send a system notification to users who logged in during the last 7 UTC calendar days.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mt-1 w-full max-w-2xl">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-white/50">{isZh ? '额度:' : 'Amt:'}</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(parseInt(e.target.value) || 1)}
                      className="w-16 px-2.5 py-1 text-center bg-black/40 border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-purple-500/50"
                      disabled={giftLoading}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder={isZh ? '赠送备注/信息 (如: 维护补偿 / 节日福利)' : 'Gift reason/message (e.g. Maintenance Compensation / Holiday Gift)'}
                    value={giftMessageInput}
                    onChange={(e) => setGiftMessageInput(e.target.value)}
                    className="flex-1 min-w-[200px] h-7 px-3 bg-black/40 border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-purple-500/50 placeholder:text-white/20"
                    disabled={giftLoading}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
              <button
                onClick={() => {
                  if (giftAmount <= 0) return
                  if (!giftMessageInput.trim()) return
                  setShowGiftConfirmation(true)
                }}
                disabled={giftLoading || giftAmount <= 0 || !giftMessageInput.trim()}
                className="px-4 py-1.5 bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 hover:border-purple-500/50 transition-colors text-xs font-bold font-mono tracking-wide flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {giftLoading ? (
                  <Icon icon="pixelarticons:reload" className="animate-spin text-sm" />
                ) : (
                  <Icon icon="pixelarticons:gift" className="text-sm" />
                )}
                {isZh ? '赠送' : 'GIFT ACTIVE'}
              </button>
            </div>
          </div>

          {/* Gift Credits to Specific User Panel */}
          <div className="bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5 flex-1 w-full">
              <div className="w-10 h-10 border flex items-center justify-center text-xl bg-purple-500/10 border-purple-500/30 text-purple-400 shrink-0">
                <Icon icon="pixelarticons:mail-flash" />
              </div>
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <h3 className={`text-white text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {isZh ? '指定用户 Credits 赠送 • 运营活动' : 'Gift Credits to Specific User • Admin'}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {isZh ? '向指定邮箱的用户赠送 Credits，并发送系统通知。' : 'Gift credits and send a system notification to a specific user by email.'}
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mt-1 w-full max-w-4xl">
                  <div className="flex-1 min-w-[180px] flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-white/50">{isZh ? '邮箱:' : 'Email:'}</span>
                    <input
                      type="email"
                      placeholder={isZh ? '用户注册邮箱' : 'User registration email'}
                      value={singleGiftEmail}
                      onChange={(e) => setSingleGiftEmail(e.target.value)}
                      className="flex-1 h-7 px-3 bg-black/40 border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-purple-500/50 placeholder:text-white/20"
                      disabled={singleGiftLoading}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono text-white/50">{isZh ? '额度:' : 'Amt:'}</span>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={singleGiftAmount}
                      onChange={(e) => setSingleGiftAmount(parseInt(e.target.value) || 1)}
                      className="w-16 px-2.5 py-1 text-center bg-black/40 border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-purple-500/50"
                      disabled={singleGiftLoading}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder={isZh ? '赠送备注/信息 (如: 补偿 / 活动福利)' : 'Gift reason/message (e.g. Compensation / Campaign Gift)'}
                    value={singleGiftMessage}
                    onChange={(e) => setSingleGiftMessage(e.target.value)}
                    className="flex-1 min-w-[200px] h-7 px-3 bg-black/40 border border-white/20 text-white font-mono text-xs focus:outline-none focus:border-purple-500/50 placeholder:text-white/20"
                    disabled={singleGiftLoading}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
              <button
                onClick={() => {
                  if (!singleGiftEmail.trim()) return
                  if (singleGiftAmount <= 0) return
                  if (!singleGiftMessage.trim()) return
                  setShowSingleGiftConfirmation(true)
                }}
                disabled={singleGiftLoading || !singleGiftEmail.trim() || singleGiftAmount <= 0 || !singleGiftMessage.trim()}
                className="px-4 py-1.5 bg-purple-500/20 border border-purple-500/40 text-purple-400 hover:bg-purple-500/30 hover:border-purple-500/50 transition-colors text-xs font-bold font-mono tracking-wide flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {singleGiftLoading ? (
                  <Icon icon="pixelarticons:reload" className="animate-spin text-sm" />
                ) : (
                  <Icon icon="pixelarticons:gift" className="text-sm" />
                )}
                {isZh ? '赠送' : 'GIFT TO USER'}
              </button>
            </div>
          </div>

          {/* Admin Purge Terminal */}
          <div className="bg-red-500/5 border border-red-500/20 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5 flex-1 w-full">
              <div className="w-10 h-10 border flex items-center justify-center text-xl bg-red-500/10 border-red-500/30 text-red-400 shrink-0">
                <Icon icon="pixelarticons:shield-attention" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className={`text-red-400 text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {isZh ? '皮肤紧急清理工具 (Admin)' : 'Emergency Skin Purge (Admin)'}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {isZh ? '输入任意 Generation Log ID 进行彻底物理删除 (清除 DB / S3)' : 'Enter any Generation Log ID for permanent DB & S3 deletion'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto md:max-w-md shrink-0 self-end md:self-auto">
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

          {/* Admin User Account Purge Terminal */}
          <div className="bg-red-500/5 border border-red-500/20 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-3.5 flex-1 w-full">
              <div className="w-10 h-10 border flex items-center justify-center text-xl bg-red-500/10 border-red-500/30 text-red-400 shrink-0">
                <Icon icon="pixelarticons:shield-attention" />
              </div>
              <div className="flex flex-col gap-0.5">
                <h3 className={`text-red-400 text-sm sm:text-base m-0 flex items-center gap-2 ${current.fontClass}`}>
                  {isZh ? '账号紧急删除工具 (Admin)' : 'Emergency User Account Purge (Admin)'}
                </h3>
                <p className="text-white/40 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider">
                  {isZh ? '输入邮箱地址彻底物理删除用户账号及其全部关联数据' : 'Enter user email to permanently delete account and all associated data'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 w-full md:w-auto md:max-w-md shrink-0 self-end md:self-auto">
              <input
                type="text"
                placeholder={isZh ? '输入邮箱 (如: user@example.com)' : 'Enter User Email...'}
                value={purgeEmailInput}
                onChange={(e) => setPurgeEmailInput(e.target.value.trim())}
                className="flex-1 min-w-[200px] h-9 px-3 bg-black/60 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-red-500/50 transition-colors placeholder:text-white/20"
              />
              <button
                onClick={() => {
                  if (!purgeEmailInput) return
                  setDeletingEmail(purgeEmailInput)
                }}
                disabled={!purgeEmailInput || actionLoading}
                className="h-9 px-4 bg-red-950/40 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500 hover:text-white text-xs font-bold font-mono uppercase tracking-wider transition-all disabled:opacity-30 disabled:pointer-events-none active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Icon icon="pixelarticons:trash" />
                {isZh ? '删除' : 'PURGE'}
              </button>
            </div>
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

        {/* 7-day Daily Active Users Chart */}
        <div className="bg-white/5 border border-white/10 p-4 flex flex-col gap-4 shrink-0 h-[250px]">
          <h3 className={`text-white/60 text-sm m-0 flex items-center gap-2 ${current.fontClass}`}>
            <Icon icon="pixelarticons:group" /> {isZh ? '每日活跃用户（近 7 天）' : 'Daily Active Users (7 Days)'}
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.history || []}>
                <defs>
                  <linearGradient id="colorActiveUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
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
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: '10px' }}
                  itemStyle={{ fontSize: '10px' }}
                />
                <Area
                  type="monotone"
                  dataKey="active_users"
                  name={isZh ? '活跃用户' : 'Active Users'}
                  stroke="#22d3ee"
                  fillOpacity={1}
                  fill="url(#colorActiveUsers)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
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
                onClick={handleOpenSkingDdjModal}
                className="px-3 h-8 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 hover:text-white hover:bg-green-500/20 hover:border-green-500 hover:shadow-lg transition-all active:scale-95 text-xs font-mono font-bold uppercase cursor-pointer"
                title={isZh ? '查看 SKING_DDJ 模型的生成状态' : 'View SKING_DDJ Generation Status'}
              >
                <Icon icon="pixelarticons:image" />
                {isZh ? 'SKING_DDJ 历史' : 'SKING_DDJ History'}
              </button>

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
                      <th className="pb-3 font-semibold">{isZh ? '提交状态' : 'Submit State'}</th>
                      <th className="pb-3 font-semibold">{isZh ? '错误原因' : 'Error Reason'}</th>
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
                          <div className="flex flex-col">
                            <span>{getModeLabel(log.mode)}</span>
                            {(log.model_version || log.aux_model_version) && (
                              <span className="text-[10px] text-white/40 font-mono mt-0.5 select-none" title={`Model: ${log.model_version || 'N/A'} | Aux: ${log.aux_model_version || 'N/A'}`}>
                                {log.model_version || '-'}{log.aux_model_version ? ` / ${log.aux_model_version}` : ''}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">
                          {getStatusBadge(log.status)}
                        </td>
                        <td className="py-3">
                          {log.provider_submission_state ? (
                            <span className={log.provider_submission_state === 'unknown' ? 'text-red-400 font-bold' : 'text-white/70'}>
                              {log.provider_submission_state}
                            </span>
                          ) : (
                            <span className="text-white/20">-</span>
                          )}
                        </td>
                        <td className="py-3 max-w-[200px]">
                          {log.error_msg ? (
                            <div 
                              onClick={() => setSelectedErrorMsg(log.error_msg)}
                              className="text-red-400 hover:text-red-300 cursor-pointer flex items-center gap-1 group/err text-[11px] select-none"
                              title={isZh ? '点击查看完整错误信息' : 'Click to view full error details'}
                            >
                              <Icon icon="pixelarticons:warning-box" className="text-xs shrink-0 text-red-500/80" />
                              <span className="truncate border-b border-dashed border-red-500/30 group-hover/err:border-red-400/60 font-mono">{log.error_msg}</span>
                            </div>
                          ) : (
                            <span className="text-white/20">-</span>
                          )}
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
      {deletingId && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
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
        </div>,
        document.body
      )}

      {/* Task Error Details Modal */}
      {selectedErrorMsg && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto p-4">
          <div className="w-full max-w-2xl bg-[#0a0a0a]/95 border border-red-500/30 flex flex-col gap-5 animate-in zoom-in-95 duration-200 shadow-2xl max-h-[85vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-5 pb-4">
              <div className="flex items-center gap-2.5">
                <Icon icon="pixelarticons:warning-box" className="text-xl text-red-500" />
                <h4 className={`text-white text-base font-bold m-0 ${current.fontClass}`}>
                  {isZh ? '任务错误详情' : 'Task Error Details'}
                </h4>
              </div>
              <button
                onClick={() => setSelectedErrorMsg(null)}
                className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 cursor-pointer"
                title={isZh ? '关闭' : 'Close'}
              >
                <Icon icon="pixelarticons:close" className="text-lg" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-2 flex flex-col gap-4">
              <div className="text-[11px] text-white/40 uppercase font-mono tracking-wider font-bold">
                {isZh ? '错误跟踪日志 / Stack Trace:' : 'Error Trace:'}
              </div>
              <pre className="bg-black/60 border border-white/10 p-4 rounded font-mono text-[11px] text-red-400/90 leading-relaxed overflow-x-auto whitespace-pre-wrap break-all max-h-[50vh] custom-scrollbar">
                {selectedErrorMsg}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-white/10 p-5 pt-4 flex gap-3 justify-end">
              <button
                onClick={() => {
                  if (selectedErrorMsg) {
                    navigator.clipboard.writeText(selectedErrorMsg);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white text-xs font-mono font-bold uppercase transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                <Icon icon={copied ? "pixelarticons:check" : "pixelarticons:copy"} className={copied ? "text-green-400" : ""} />
                {copied ? (isZh ? '已复制' : 'COPIED') : (isZh ? '复制日志' : 'COPY LOG')}
              </button>
              <button
                onClick={() => setSelectedErrorMsg(null)}
                className="px-4 py-2 bg-red-950/40 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500 hover:text-white text-xs font-mono font-bold uppercase transition-all cursor-pointer active:scale-95"
              >
                {isZh ? '关闭' : 'Close'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* User Deletion Confirmation Modal */}
      {deletingEmail && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="w-full max-w-md bg-[#0a0a0a]/90 border border-red-500/30 p-6 flex flex-col gap-6 animate-in zoom-in-95 duration-200 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 text-2xl shrink-0">
                <Icon icon="pixelarticons:shield-attention" />
              </div>
              <div className="flex flex-col gap-1">
                <h4 className={`text-white text-base m-0 ${current.fontClass}`}>
                  {isZh ? '确认要彻底删除该账号吗？' : 'Confirm Permanent Account Purge'}
                </h4>
                <p className="text-white/60 text-xs leading-relaxed mt-1">
                  {isZh ? (
                    <>
                      您正在请求彻底删除账号 <strong>{deletingEmail}</strong>。
                      这将永久注销该用户，并<b>彻底物理清除</b>其所有相关的生成日志、S3中的文件、收藏夹、订单、论坛帖子和回复等所有数据。此操作不可逆！
                    </>
                  ) : (
                    <>
                      Are you sure you want to permanently delete account <strong>{deletingEmail}</strong>?
                      This will permanently delete the user profile and <b>physically erase</b> all associated generation logs, S3 assets, collections, orders, and forum posts/replies. This action is irreversible.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingEmail(null)}
                disabled={actionLoading}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={() => executeUserDelete(deletingEmail)}
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
        </div>,
        document.body
      )}

      {/* Seven-Day Active User Gift Confirmation Modal */}
      {showGiftConfirmation && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="w-full max-w-md bg-[#0a0a0a]/90 border border-purple-500/30 p-6 flex flex-col gap-6 animate-in zoom-in-95 duration-200 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-500 text-2xl shrink-0">
                <Icon icon="pixelarticons:shield-attention" />
              </div>
              <div className="flex flex-col gap-1">
                <h4 className={`text-white text-base m-0 ${current.fontClass}`}>
                  {isZh ? '确认向 7 日活跃用户赠送 Credits 吗？' : 'Confirm Active User Gift'}
                </h4>
                <p className="text-white/60 text-xs leading-relaxed mt-1">
                  {isZh ? (
                    <>
                      您正在请求向<b>近 7 个 UTC 自然日内至少登录一次的用户</b>赠送 <strong>{giftAmount}</strong> Credits。
                      <br />
                      备注说明: <span className="text-purple-400 font-bold font-mono">"{giftMessageInput.trim()}"</span>
                      <br />
                      此操作将立即修改符合条件用户的额度余额，并发送系统通知，无法批量撤销！
                    </>
                  ) : (
                    <>
                      You are about to gift <strong>{giftAmount}</strong> credits to users who logged in during the <b>last 7 UTC calendar days</b>.
                      <br />
                      Message: <span className="text-purple-400 font-bold font-mono">"{giftMessageInput.trim()}"</span>
                      <br />
                      This will modify matching users' credit balances and send system notifications immediately. It cannot be bulk-reverted!
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowGiftConfirmation(false)}
                disabled={giftLoading}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={executeActiveUserGift}
                disabled={giftLoading}
                className="px-4 py-2 bg-purple-950/40 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500 hover:text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                {giftLoading ? (
                  <Icon icon="pixelarticons:reload" className="animate-spin text-purple-500" />
                ) : (
                  <Icon icon="pixelarticons:gift" />
                )}
                {isZh ? '确认赠送' : 'CONFIRM GIFT'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Specific User Gift Confirmation Modal */}
      {showSingleGiftConfirmation && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="w-full max-w-md bg-[#0a0a0a]/90 border border-purple-500/30 p-6 flex flex-col gap-6 animate-in zoom-in-95 duration-200 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-500 text-2xl shrink-0">
                <Icon icon="pixelarticons:shield-attention" />
              </div>
              <div className="flex flex-col gap-1">
                <h4 className={`text-white text-base m-0 ${current.fontClass}`}>
                  {isZh ? '确认向指定用户赠送 Credits 吗？' : 'Confirm Specific User Gift'}
                </h4>
                <p className="text-white/60 text-xs leading-relaxed mt-1">
                  {isZh ? (
                    <>
                      您正在请求向用户 <b>{singleGiftEmail.trim()}</b> 赠送 <strong>{singleGiftAmount}</strong> Credits。
                      <br />
                      备注说明: <span className="text-purple-400 font-bold font-mono">"{singleGiftMessage.trim()}"</span>
                      <br />
                      此操作将立即修改该用户的额度余额，并发送系统通知！
                    </>
                  ) : (
                    <>
                      You are about to gift <strong>{singleGiftAmount}</strong> credits to user <b>{singleGiftEmail.trim()}</b>.
                      <br />
                      Message: <span className="text-purple-400 font-bold font-mono">"{singleGiftMessage.trim()}"</span>
                      <br />
                      This will modify the user's credit balance and send a system notification immediately.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSingleGiftConfirmation(false)}
                disabled={singleGiftLoading}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 hover:text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95"
              >
                {isZh ? '取消' : 'Cancel'}
              </button>
              <button
                onClick={executeSingleGift}
                disabled={singleGiftLoading}
                className="px-4 py-2 bg-purple-950/40 border border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:border-purple-500 hover:text-white text-xs font-mono font-bold uppercase transition-all disabled:opacity-50 cursor-pointer active:scale-95 flex items-center gap-1.5"
              >
                {singleGiftLoading ? (
                  <Icon icon="pixelarticons:reload" className="animate-spin text-purple-500" />
                ) : (
                  <Icon icon="pixelarticons:gift" />
                )}
                {isZh ? '确认赠送' : 'CONFIRM GIFT'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* SKING_DDJ Series Generations Modal */}
      {showSkingDdjModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto p-4">
          <div className="w-full max-w-4xl bg-[#0a0a0a]/95 border border-green-500/30 flex flex-col gap-5 animate-in zoom-in-95 duration-200 shadow-2xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-5 pb-4">
              <div className="flex items-center gap-2.5">
                <Icon icon="pixelarticons:device-tv" className="text-xl text-green-500" />
                <h4 className={`text-white text-base font-bold m-0 ${current.fontClass}`}>
                  {isZh ? 'SKING_DDJ 系列模型生成监控' : 'SKING_DDJ Series Generation Monitor'}
                </h4>
              </div>
              <button
                onClick={() => setShowSkingDdjModal(false)}
                className="w-8 h-8 flex items-center justify-center bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 cursor-pointer"
                title={isZh ? '关闭' : 'Close'}
              >
                <Icon icon="pixelarticons:close" className="text-lg" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-2 flex flex-col gap-4">
              {loadingSkingDdj && !skingDdjData ? (
                <div className="py-20 flex items-center justify-center">
                  <Icon icon="pixelarticons:reload" className="text-4xl text-green-500 animate-spin" />
                </div>
              ) : !skingDdjData || skingDdjData.items.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-white/40">
                  <Icon icon="pixelarticons:image" className="text-4xl" />
                  <span className="text-xs mt-2">{isZh ? '暂无 SKING_DDJ 模型的生成记录' : 'No SKING_DDJ generation records found'}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {skingDdjData.items.map((log) => (
                    <div key={log.id} className="bg-white/5 border border-white/10 p-4 flex flex-col gap-3">
                      {/* Log Metadata Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 text-[11px] font-mono">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-white/40">
                            ID: <span className="text-white/80 font-bold">{log.id}</span>
                          </span>
                          <span className="text-white/40">
                            {isZh ? '模型: ' : 'MODEL: '}<span className="text-white/80">{log.model_version}</span>
                          </span>
                          {log.mode && (
                            <span className="text-white/40">
                              {isZh ? '模式: ' : 'MODE: '}<span className="text-white/80">{getModeLabel(log.mode)}</span>
                            </span>
                          )}
                          {log.provider_submission_state && (
                            <span className="text-white/40">
                              {isZh ? '提交状态: ' : 'SUBMIT: '}
                              <span className={log.provider_submission_state === 'unknown' ? 'text-red-400 font-bold' : 'text-white/80'}>
                                {log.provider_submission_state}
                              </span>
                            </span>
                          )}
                          {log.provider_task_id && (
                            <span className="text-white/40">
                              PROVIDER: <span className="text-white/80">{log.provider_task_id}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-white/40">
                            {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
                          </span>
                          <span className={`px-2 py-0.5 border text-[10px] uppercase font-bold tracking-wider ${
                            log.status === 'success'
                              ? 'bg-green-500/10 border-green-500/30 text-green-400'
                              : log.status === 'failed'
                              ? 'bg-red-500/10 border-red-500/30 text-red-400'
                              : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400 animate-pulse'
                          }`}>
                            {log.status}
                          </span>
                        </div>
                      </div>

                      {/* Prompts, if present */}
                      {log.prompt && (
                        <div className="text-[11px] text-white/60 bg-black/40 p-2 border border-white/5 leading-relaxed font-mono">
                          <span className="text-white/30 uppercase font-bold mr-1">{isZh ? '提示词:' : 'Prompt:'}</span>
                          {log.prompt}
                        </div>
                      )}
                      {log.error_msg && (
                        <div className="text-[11px] text-red-300 bg-red-950/30 p-2 border border-red-500/20 leading-relaxed font-mono whitespace-pre-wrap break-all">
                          <span className="text-red-400/70 uppercase font-bold mr-1">ERROR:</span>
                          {log.error_msg}
                        </div>
                      )}

                      {/* Image Comparison Rows */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Original Image Card */}
                        <div className="flex items-center gap-3 bg-black/30 border border-white/5 p-3 rounded">
                          <div className="w-20 h-20 bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative group">
                            {log.source_url ? (
                              <img
                                src={log.source_url}
                                alt="Original"
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <Icon icon="pixelarticons:image" className="text-white/20 text-2xl" />
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-between h-20 py-0.5">
                            <div>
                              <span className="text-xs text-white font-bold block">{isZh ? '原图' : 'Original Image'}</span>
                              <span className="text-[9px] font-mono text-white/40 block mt-1 break-all truncate max-w-[180px]">
                                {log.source_url ? 'source.png' : (isZh ? '无原图' : 'No source image')}
                              </span>
                            </div>
                            <button
                              onClick={() => log.source_url && downloadImage(log.source_url, `source_${log.id}.png`)}
                              disabled={!log.source_url}
                              className="self-start px-2.5 py-1 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none text-[10px] font-mono font-bold text-white/80 hover:text-white uppercase transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                            >
                              <Icon icon="pixelarticons:download" className="text-xs" />
                              {isZh ? '下载' : 'Download'}
                            </button>
                          </div>
                        </div>

                        {/* Edited Result Card */}
                        <div className="flex items-center gap-3 bg-black/30 border border-white/5 p-3 rounded">
                          <div className="w-20 h-20 bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 relative group">
                            {log.edited_image_url ? (
                              <img
                                src={log.edited_image_url}
                                alt="Edited Result"
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              <div className="flex flex-col items-center justify-center">
                                {log.status === 'success' || log.status === 'failed' ? (
                                  <Icon icon="pixelarticons:close" className="text-red-500/40 text-xl" />
                                ) : (
                                  <Icon icon="pixelarticons:reload" className="text-yellow-500/40 text-xl animate-spin" />
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 flex flex-col justify-between h-20 py-0.5">
                            <div>
                              <span className="text-xs text-white font-bold block">{isZh ? '处理后/编辑图' : 'Edited Result'}</span>
                              <span className="text-[9px] font-mono text-white/40 block mt-1 break-all truncate max-w-[180px]">
                                {log.edited_image_url ? 'edited_result.png' : (log.status === 'failed' ? (isZh ? '处理失败' : 'Failed') : (isZh ? '无处理图' : 'No edited result'))}
                              </span>
                            </div>
                            <button
                              onClick={() => log.edited_image_url && downloadImage(log.edited_image_url, `edited_${log.id}.png`)}
                              disabled={!log.edited_image_url}
                              className="self-start px-2.5 py-1 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 disabled:opacity-30 disabled:pointer-events-none text-[10px] font-mono font-bold text-white/80 hover:text-white uppercase transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                            >
                              <Icon icon="pixelarticons:download" className="text-xs" />
                              {isZh ? '下载' : 'Download'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer (Pagination) */}
            {skingDdjData && skingDdjData.total_pages > 1 && (
              <div className="border-t border-white/10 p-5 flex items-center justify-between gap-4 font-mono shrink-0">
                <span className="text-[10px] text-white/40">
                  {isZh ? (
                    <>共 <span className="text-white font-bold">{skingDdjData.total_count}</span> 项 • 第 <span className="text-white font-bold">{skingDdjPage}</span>/{skingDdjData.total_pages} 页</>
                  ) : (
                    <>Total <span className="text-white font-bold">{skingDdjData.total_count}</span> items • Page <span className="text-white font-bold">{skingDdjPage}</span> of {skingDdjData.total_pages}</>
                  )}
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setSkingDdjPage(p => Math.max(1, p - 1))}
                    disabled={skingDdjPage === 1}
                    className="px-3 py-1 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-[10px]"
                  >
                    {isZh ? '上一页' : 'PREV'}
                  </button>
                  
                  {Array.from({ length: skingDdjData.total_pages }, (_, i) => i + 1)
                    .filter(p => Math.abs(p - skingDdjPage) <= 2 || p === 1 || p === skingDdjData.total_pages)
                    .map((p, idx, arr) => {
                      const showEllipsis = idx > 0 && p - arr[idx - 1] > 1;
                      return (
                        <div key={p} className="flex items-center gap-1.5">
                          {showEllipsis && <span className="text-white/20 text-xs px-1">...</span>}
                          <button
                            onClick={() => setSkingDdjPage(p)}
                            className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold border transition-all active:scale-95 cursor-pointer ${
                              skingDdjPage === p
                                ? 'bg-green-500/10 border-green-500/40 text-green-400'
                                : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20'
                            }`}
                          >
                            {p}
                          </button>
                        </div>
                      );
                    })
                  }

                  <button
                    onClick={() => setSkingDdjPage(p => Math.min(skingDdjData.total_pages, p + 1))}
                    disabled={skingDdjPage === skingDdjData.total_pages}
                    className="px-3 py-1 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none cursor-pointer text-[10px]"
                  >
                    {isZh ? '下一页' : 'NEXT'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
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

type BackendHistoryMetric = 'cpu_percent' | 'memory_percent' | 'disk_percent'

const INSTANCE_CHART_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#f59e0b',
  '#34d399',
  '#f472b6',
  '#60a5fa',
]

function BackendHistoryChart({
  title,
  icon,
  metric,
  history,
}: {
  title: string;
  icon: string;
  metric: BackendHistoryMetric;
  history: BackendHistoryData;
}) {
  const data = buildBackendHistoryChartData(history, metric)

  return (
    <div className="h-[260px] bg-black/20 border border-white/5 p-3 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h4 className="m-0 text-[11px] text-white/60 font-mono uppercase flex items-center gap-1.5">
          <Icon icon={icon} className="text-cyan-400" /> {title}
        </h4>
        <span className="text-[8px] text-white/20 font-mono uppercase">12H • %</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff0d" vertical={false} />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              stroke="#ffffff30"
              fontSize={8}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
              tickFormatter={formatHistoryTick}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#ffffff30"
              fontSize={8}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '9px' }}
              labelFormatter={(value) => new Date(Number(value)).toLocaleString()}
              itemStyle={{ fontSize: '9px' }}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconType="plainline"
              wrapperStyle={{ fontSize: '8px', fontFamily: 'monospace' }}
            />
            {history.series.map((series, index) => (
              <Line
                key={`${metric}-${series.instance_id}`}
                type="monotone"
                dataKey={series.instance_id}
                name={series.display_name}
                stroke={INSTANCE_CHART_COLORS[index % INSTANCE_CHART_COLORS.length]}
                strokeWidth={1.5}
                dot={data.length <= 1 ? { r: 2 } : false}
                connectNulls={false}
                isAnimationActive={false}
                unit="%"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function buildBackendHistoryChartData(history: BackendHistoryData, metric: BackendHistoryMetric) {
  const rows = new Map<number, Record<string, number>>()

  history.series.forEach(series => {
    series.samples.forEach(sample => {
      const timestamp = new Date(sample.timestamp).getTime()
      const value = sample[metric]
      if (!Number.isFinite(timestamp) || value === null || !Number.isFinite(value)) return
      const row = rows.get(timestamp) || { timestamp }
      row[series.instance_id] = value
      rows.set(timestamp, row)
    })
  })

  return Array.from(rows.values()).sort((a, b) => a.timestamp - b.timestamp)
}

function formatHistoryTick(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ResourceMeter({
  label,
  icon,
  percent,
  detail,
}: {
  label: string;
  icon: string;
  percent: number | null;
  detail: string;
}) {
  const safePercent = percent === null ? 0 : Math.max(0, Math.min(100, percent))
  const barColor = percent === null
    ? 'bg-white/20'
    : percent >= 90
      ? 'bg-red-500'
      : percent >= 70
        ? 'bg-yellow-500'
        : 'bg-cyan-400'
  const valueColor = percent === null
    ? 'text-white/30'
    : percent >= 90
      ? 'text-red-400'
      : percent >= 70
        ? 'text-yellow-400'
        : 'text-white'

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-[10px] text-white/45 font-mono uppercase">
          <Icon icon={icon} /> {label}
        </span>
        <span className={`text-sm font-bold font-mono ${valueColor}`}>
          {percent === null ? '--' : `${percent.toFixed(1)}%`}
        </span>
      </div>
      <div
        className="h-1.5 bg-white/5 overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : safePercent}
      >
        <div
          className={`h-full transition-all duration-500 ${barColor}`}
          style={{ width: `${safePercent}%` }}
        />
      </div>
      <div className="text-[8px] text-white/25 font-mono mt-1.5 truncate">{detail}</div>
    </div>
  )
}

function formatBytes(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return '--'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

function formatUsage(used: number | null, limit: number | null) {
  if (used === null) return '--'
  return limit === null ? formatBytes(used) : `${formatBytes(used)} / ${formatBytes(limit)}`
}

function formatHeartbeatAge(seconds: number, isZh: boolean) {
  if (seconds < 5) return isZh ? '刚刚' : 'now'
  if (seconds < 60) return isZh ? `${seconds} 秒前` : `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return isZh ? `${minutes} 分钟前` : `${minutes}m ago`
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
