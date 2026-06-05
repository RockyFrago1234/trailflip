import { supabase } from './supabase'

// Schedule-C-friendly expense buckets for the dropdown.
export const EXPENSE_CATEGORIES = [
  { id: 'supplies', label: 'Supplies & packaging' },
  { id: 'shipping', label: 'Shipping & postage' },
  { id: 'fees', label: 'Platform / store fees' },
  { id: 'travel', label: 'Travel / mileage' },
  { id: 'repair', label: 'Repairs & parts' },
  { id: 'taxes', label: 'Taxes & licenses' },
  { id: 'equipment', label: 'Tools & equipment' },
  { id: 'software', label: 'Software & subscriptions' },
  { id: 'office', label: 'Home office' },
  { id: 'other', label: 'Other' },
]
export const expenseLabel = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label || 'Other'

function fromRow(r) {
  return { id: r.id, date: r.date, category: r.category, amount: Number(r.amount) || 0, note: r.note || '', itemId: r.item_id || null }
}

// Returns { expenses, available } — `available:false` means the table isn't
// there yet (migration pending), so the books still render from item data.
export async function loadExpenses(userId) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) {
    return { expenses: [], available: false }
  }
  return { expenses: (data || []).map(fromRow), available: true }
}

// Expenses tied to one item (for the item view + its true net).
export async function loadItemExpenses(userId, itemId) {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .eq('item_id', itemId)
    .order('date', { ascending: false })
  if (error) return []
  return (data || []).map(fromRow)
}

export async function createExpense(userId, { date, category, amount, note, itemId = null }) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({ user_id: userId, date, category, amount, note: note || '', item_id: itemId })
    .select()
    .single()
  if (error) throw error
  return fromRow(data)
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
