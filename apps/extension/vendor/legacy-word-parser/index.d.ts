export interface DocSections {
  body: string;
  headers: string;
  textboxes: string;
  headerTextboxes: string;
  footnotes: string;
  endnotes: string;
  annotations: string;
}
export interface DocToText {
  (bytes: Uint8Array | ArrayBuffer): string | null;
  sections(bytes: Uint8Array | ArrayBuffer): DocSections | null;
}
declare const docToText: DocToText;
export default docToText;
