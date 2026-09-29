export function decodeDataUrl(url: string) {
  const idx = url.indexOf(",")
  if (idx === -1) return ""

  const head = url.slice(0, idx)
  const body = url.slice(idx + 1)
  if (head.includes(";base64")) return Buffer.from(body, "base64").toString("utf8")
  return decodeURIComponent(body)
}

/** True for data URLs whose payload after the comma is empty ("data:image/jpeg;base64,") */
export function isEmptyDataUrl(url: string) {
  if (!url.startsWith("data:")) return false
  const idx = url.indexOf(",")
  return idx === -1 || url.slice(idx + 1) === ""
}
