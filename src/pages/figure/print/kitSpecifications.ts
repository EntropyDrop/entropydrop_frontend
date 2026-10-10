export interface KitSpecifications {
    product_name: string
    dimensions: string
    materials: { name: string; quantity: number; description?: string | null }[]
    assembly_note: string
}

export interface KitSpecificationRecord {
    kit_specifications_snapshot?: KitSpecifications | null
    kit_specifications_current?: KitSpecifications | null
}
