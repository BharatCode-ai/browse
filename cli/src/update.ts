// Retain the previous doctor report shape for clients. New relays report null.
export type UpdateJson = { readonly summary: string; readonly notice: string } | null
