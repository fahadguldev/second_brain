import { useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, Play, VideoCamera } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import type { SourceItem } from '../../types'

function sourceMetadata(item: SourceItem) {
  return item.payload?.metadata ?? item.metadata
}

interface VideoPreview {
  url: string
  title: string
}

export function VideoRecommendations({ sources }: { sources: SourceItem[] }) {
  const videoUrls = useMemo(
    () =>
      Array.from(
        new Set(
          sources
            .map(source => sourceMetadata(source)?.source?.url)
            .filter((url): url is string => Boolean(url)),
        ),
      ),
    [sources],
  )
  const [videos, setVideos] = useState<VideoPreview[]>([])

  useEffect(() => {
    let cancelled = false

    const initialVideos: VideoPreview[] = videoUrls.slice(0, 3).map(url => ({
      url,
      title: 'Watch related video on TikTok',
    }))
    setVideos(initialVideos)

    Promise.all(
      videoUrls.slice(0, 3).map(async url => {
        if (!url.includes('tiktok.com/')) {
          return { url, title: 'Watch related video' } satisfies VideoPreview
        }
        try {
          const response = await fetch(
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
          )
          if (!response.ok) return { url, title: 'Watch related video on TikTok' }
          const data = await response.json()
          return {
            url,
            title: data.title?.trim() || 'Watch related video on TikTok',
          } satisfies VideoPreview
        } catch {
          return { url, title: 'Watch related video on TikTok' } satisfies VideoPreview
        }
      }),
    ).then(results => {
      if (!cancelled) setVideos(results)
    })

    return () => {
      cancelled = true
    }
  }, [videoUrls])

  if (videos.length === 0) return null

  return (
    <section className="mt-3 border-t border-line/60 pt-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        <VideoCamera size={13} weight="bold" />
        <span>Related video{videos.length > 1 ? 's' : ''}</span>
      </div>
      <div className="flex flex-col gap-2">
        {videos.map(video => (
          <motion.a
            key={video.url}
            href={video.url}
            target="_blank"
            rel="noreferrer"
            whileHover={{ y: -1, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="group flex items-center gap-2.5 rounded-xl border border-line/70 bg-raised/40 px-3 py-2 text-xs font-medium text-ink transition-colors hover:border-accent/40 hover:bg-accent/5 hover:text-accent"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-accent transition-transform group-hover:scale-110">
              <Play size={10} weight="fill" />
            </span>
            <span className="line-clamp-1 flex-1 text-[13px]">{video.title}</span>
            <ArrowSquareOut
              size={13}
              className="shrink-0 text-muted opacity-60 transition-opacity group-hover:opacity-100"
            />
          </motion.a>
        ))}
      </div>
    </section>
  )
}
