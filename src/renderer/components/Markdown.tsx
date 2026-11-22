import type { ReactNode } from 'react'

/**
 * Small, dependency-free Markdown renderer for catalog descriptions.
 * Everything is emitted as React text/elements — raw HTML is never injected.
 */

const FENCE = /^\s*```(\w*)\s*$/
const FENCE_END = /^\s*```\s*$/
const HEADING = /^\s*(#{1,6})\s+(.*)$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s*>\s?/
const BULLET = /^\s*[-*+]\s+/
const ORDERED = /^\s*\d+[.)]\s+/
const INLINE = /(!\[[^\]]*\]\([^)]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g

function safeUrl(raw: string): string | null {
  const url = raw.trim()
  if (/^https?:\/\//i.test(url)) return url
  // Modrinth descriptions often use site-relative links.
  if (url.startsWith('/') && !url.startsWith('//')) return `https://modrinth.com${url}`
  return null
}

function inline(text: string, prefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const regex = new RegExp(INLINE.source, 'g')
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index))
    const token = match[0]
    const key = `${prefix}-${match.index}`
    if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{inline(token.slice(2, -2), key)}</strong>)
    } else if (token.startsWith('~~')) {
      nodes.push(<del key={key}>{inline(token.slice(2, -2), key)}</del>)
    } else if (token.startsWith('`')) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('![')) {
      const image = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token)
      if (image) {
        const url = safeUrl(image[2])
        nodes.push(url
          ? <img key={key} src={url} alt={image[1]} className="my-2 max-h-80 rounded-xl object-contain" />
          : <span key={key}>{image[1]}</span>)
      } else {
        nodes.push(token)
      }
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      if (link) {
        const url = safeUrl(link[2])
        nodes.push(url
          ? <a key={key} href={url} target="_blank" rel="noopener noreferrer">{inline(link[1], key)}</a>
          : <span key={key}>{inline(link[1], key)}</span>)
      } else {
        nodes.push(token)
      }
    } else {
      nodes.push(<em key={key}>{inline(token.slice(1, -1), key)}</em>)
    }
    last = match.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function isBlockStart(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line)
    || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line)
}

export function Markdown({ source, className = '' }: { source: string; className?: string }): JSX.Element {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index++
      continue
    }

    if (FENCE.test(line)) {
      const code: string[] = []
      index++
      while (index < lines.length && !FENCE_END.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index++
      blocks.push(<pre key={key++}><code>{code.join('\n')}</code></pre>)
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const level = Math.min(6, heading[1].length) as 1 | 2 | 3 | 4 | 5 | 6
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      blocks.push(<Tag key={key++}>{inline(heading[2], `h${key}`)}</Tag>)
      index++
      continue
    }

    if (RULE.test(line)) {
      blocks.push(<hr key={key++} />)
      index++
      continue
    }

    if (QUOTE.test(line)) {
      const quote: string[] = []
      while (index < lines.length && QUOTE.test(lines[index])) {
        quote.push(lines[index].replace(QUOTE, ''))
        index++
      }
      blocks.push(
        <blockquote key={key++}>
          {quote.map((entry, position) => <p key={position}>{inline(entry, `q${key}-${position}`)}</p>)}
        </blockquote>
      )
      continue
    }

    const listPattern = BULLET.test(line) ? BULLET : ORDERED.test(line) ? ORDERED : null
    if (listPattern) {
      const ordered = listPattern === ORDERED
      const strip = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/
      const items: string[] = []
      while (index < lines.length && listPattern.test(lines[index])) {
        items.push(lines[index].replace(strip, ''))
        index++
      }
      const contents = items.map((entry, position) => (
        <li key={position}>{inline(entry, `${ordered ? 'ol' : 'ul'}${key}-${position}`)}</li>
      ))
      blocks.push(ordered ? <ol key={key++}>{contents}</ol> : <ul key={key++}>{contents}</ul>)
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim())
      index++
    }
    if (paragraph.length) {
      blocks.push(
        <p key={key++}>
          {paragraph.map((entry, position) => (
            <span key={position}>
              {position > 0 && <br />}
              {inline(entry, `p${key}-${position}`)}
            </span>
          ))}
        </p>
      )
    }
  }

  return <div className={`markdown-body ${className}`}>{blocks}</div>
}
