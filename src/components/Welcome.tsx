// The first screen: what AutoClip does in three beats, a big drop target and a one-click demo.

import { AudioWaveform, Clapperboard, FolderOpen, ScanEye, ShieldCheck, Sparkles } from 'lucide-react'
import { useRef } from 'react'
import { addFiles, loadDemo } from '../state/actions'
import { useApp } from '../state/store'
import { Ring } from './ui'

const STEPS = [
  { icon: AudioWaveform, title: 'Listens', body: 'Finds the tempo, every beat and bar, the builds and the drops.' },
  { icon: ScanEye, title: 'Watches', body: 'Scores every second of your footage for action, impact and crowd noise.' },
  { icon: Clapperboard, title: 'Cuts', body: 'Puts the best moment on the drop and every cut on the beat, with effects.' },
]

export function Welcome() {
  const demo = useApp((s) => s.demoLoading)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="rise mx-auto flex max-w-3xl flex-col items-center px-4 py-8 text-center sm:py-14">
      <div className="label mb-4 flex items-center gap-2">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Auto editor
      </div>
      <h1 className="display text-4xl leading-[1.02] sm:text-6xl">
        Drop a song.
        <br />
        Drop your clips.
        <br />
        <span className="text-accent">Get the edit.</span>
      </h1>
      <p className="mt-5 max-w-xl text-base text-ink-2 sm:text-lg">
        AutoClip hears the beat drops, finds the highlights in your footage and cuts a synced edit on its own. UFC, hoops, travel, anything.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button className="btn btn-primary btn-xl" onClick={() => inputRef.current?.click()}>
          <FolderOpen className="size-5" /> Choose a song + clips
        </button>
        <button className="btn btn-xl" onClick={() => void loadDemo()} disabled={demo !== null}>
          {demo !== null ? <Ring value={demo} size={20} /> : <Sparkles className="size-5" />}
          {demo !== null ? 'Making demo footage…' : 'Try the demo'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/*,video/*,image/*,.srt,.lrc"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addFiles([...e.target.files])
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-3 text-sm text-ink-3">or drag everything onto this window at once</p>

      <div className="mt-12 grid w-full gap-3 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <div key={title} className="panel p-4 text-left">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-ink-3">0{i + 1}</span>
              <Icon className="size-4 text-accent" />
              <span className="display text-sm">{title}</span>
            </div>
            <p className="mt-2 text-sm leading-snug text-ink-2">{body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 flex items-center gap-1.5 text-xs text-ink-3">
        <ShieldCheck className="size-3.5" /> Everything runs on your device. Your music and footage are never uploaded.
      </p>
    </div>
  )
}
