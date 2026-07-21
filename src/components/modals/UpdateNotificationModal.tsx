import { Download, ExternalLink, X, Clock, Package } from 'lucide-react'
import { useUpdate } from '../../contexts/UpdateContext'

export default function UpdateNotificationModal() {
  const {
    updateInfo,
    isDownloading,
    downloadProgress,
    error,
    downloadAndInstall,
    dismissUpdate,
  } = useUpdate()

  if (!updateInfo) return null

  const openReleasePage = () => {
    window.open(updateInfo.releaseUrl, '_blank', 'noopener,noreferrer')
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch {
      return iso
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !isDownloading) dismissUpdate() }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'var(--bg-elevated, #1e1e2e)',
          border: '1px solid var(--border-default, #333)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center gap-4"
          style={{
            background: 'linear-gradient(135deg, #1e3a5f 0%, #1a1a2e 100%)',
            borderBottom: '1px solid rgba(59, 130, 246, 0.2)',
          }}
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
            }}
          >
            <Package size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white">发现新版本</h3>
            <p className="text-sm mt-0.5" style={{ color: '#94a3b8' }}>
              v{updateInfo.currentVersion} → v{updateInfo.latestVersion}
            </p>
          </div>
          {!isDownloading && (
            <button
              onClick={dismissUpdate}
              className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-white/10"
              style={{ color: '#94a3b8' }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4" style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {/* Published date */}
          {updateInfo.publishedAt && (
            <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: 'var(--text-muted, #888)' }}>
              <Clock size={12} />
              {formatDate(updateInfo.publishedAt)}
            </div>
          )}

          {/* Release notes */}
          {updateInfo.releaseNotes && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted, #888)' }}>
                更新内容
              </div>
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: 'var(--text-secondary, #ccc)' }}
              >
                {updateInfo.releaseNotes.slice(0, 2000)}
                {updateInfo.releaseNotes.length > 2000 && (
                  <span style={{ color: 'var(--text-muted, #888)' }}>...</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Download progress */}
        {isDownloading && (
          <div className="px-6 py-3">
            <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-secondary, #ccc)' }}>
              <span>正在下载...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-overlay, #333)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${downloadProgress}%`,
                  background: 'linear-gradient(90deg, #3b82f6, #2563eb)',
                }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            className="mx-6 mb-4 rounded-lg px-3 py-2 text-xs"
            style={{
              background: 'rgba(248,81,73,0.1)',
              color: '#f85149',
              border: '1px solid rgba(248,81,73,0.25)',
            }}
          >
            {error}
          </div>
        )}

        {/* Footer buttons */}
        <div
          className="px-6 py-4 flex items-center gap-3"
          style={{ borderTop: '1px solid var(--border-default, #333)' }}
        >
          <button
            onClick={openReleasePage}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:brightness-110 disabled:opacity-50"
            style={{
              background: 'var(--bg-overlay, #333)',
              color: 'var(--text-secondary, #ccc)',
            }}
          >
            <ExternalLink size={12} />
            GitHub 查看
          </button>
          <button
            onClick={dismissUpdate}
            disabled={isDownloading}
            className="flex-1 px-4 py-2 rounded-lg text-xs font-medium transition-colors hover:brightness-110 disabled:opacity-50"
            style={{
              background: 'var(--bg-overlay, #333)',
              color: 'var(--text-secondary, #ccc)',
            }}
          >
            稍后提醒
          </button>
          <button
            onClick={downloadAndInstall}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-medium text-white transition-all hover:shadow-lg hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
          >
            <Download size={12} />
            {isDownloading ? '下载中...' : '下载更新'}
          </button>
        </div>
      </div>
    </div>
  )
}
