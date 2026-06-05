/** Typen und Defaults für die Druckkonfiguration */

export interface PrintConfigHeader {
  company_name:     string;
  company_subtitle: string;
  company_address:  string;
  company_phone:    string;
  damage_title:     string;
  order_title:      string;
}

export interface PrintConfigDamage {
  show_map:         boolean;
  show_photos:      boolean;
  show_history:     boolean;
  show_network_ref: boolean;
  show_properties:  boolean;
  show_description: boolean;
}

export interface PrintConfigOrder {
  show_positions:  boolean;
  show_description:boolean;
  show_remarks:    boolean;
}

export interface PrintConfig {
  header:      PrintConfigHeader;
  damage:      PrintConfigDamage;
  order:       PrintConfigOrder;
  footer_text: string;
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  header: {
    company_name:     '',
    company_subtitle: '',
    company_address:  '',
    company_phone:    '',
    damage_title:     'Schadensmeldung',
    order_title:      'Arbeitsauftrag',
  },
  damage: {
    show_map:         true,
    show_photos:      true,
    show_history:     true,
    show_network_ref: true,
    show_properties:  true,
    show_description: true,
  },
  order: {
    show_positions:   true,
    show_description: true,
    show_remarks:     true,
  },
  footer_text: 'Schadensverwaltung · vertraulich',
};

/** Merged: Default-Werte + gespeicherte Werte */
export function mergePrintConfig(saved: Partial<PrintConfig> | null): PrintConfig {
  if (!saved) return DEFAULT_PRINT_CONFIG;
  return {
    header:      { ...DEFAULT_PRINT_CONFIG.header,  ...(saved.header  ?? {}) },
    damage:      { ...DEFAULT_PRINT_CONFIG.damage,  ...(saved.damage  ?? {}) },
    order:       { ...DEFAULT_PRINT_CONFIG.order,   ...(saved.order   ?? {}) },
    footer_text: saved.footer_text ?? DEFAULT_PRINT_CONFIG.footer_text,
  };
}
