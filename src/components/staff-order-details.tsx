import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { OrderLanguageField, OrderSoftwareField } from '@/components/order-requirement-fields'
import { selectedSoftware, softwareSelectionError, type OrderLanguage, type SoftwareSelection } from '@/lib/order-requirements'
import { updateStaffOrderDetails } from '@/lib/orders.functions'
import { canChangeUnpaidQuote, type AdminOrderView } from '@/lib/orders'
import { softwareWorkFee } from '@/lib/pricing'

export function StaffOrderDetails({
  order,
  onSaved,
}: {
  order: AdminOrderView
  onSaved: () => Promise<unknown>
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [language, setLanguage] = useState<OrderLanguage | ''>(order.language ?? '')
  const [software, setSoftware] = useState<SoftwareSelection>(order.software ?? 'none')
  const [softwareDetails, setSoftwareDetails] = useState(order.softwareDetails ?? '')
  const editSoftware = canChangeUnpaidQuote(order)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const softwareError = editSoftware && softwareSelectionError(software, softwareDetails)
    if (softwareError) {
      setProblem(softwareError)
      return
    }
    const form = new FormData(event.currentTarget)
    const deadline = String(form.get('deadline') ?? '')
    setBusy(true)
    setProblem('')
    try {
      await updateStaffOrderDetails({
        data: {
          code: order.code,
          revision: order.detailsRevision,
          topic: String(form.get('topic') ?? ''),
          subject: String(form.get('subject') ?? ''),
          style: String(form.get('style') ?? ''),
          sources: Number(form.get('sources')),
          language: language || null,
          ...(editSoftware ? { software: selectedSoftware(software), softwareDetails } : {}),
          instructions: String(form.get('instructions') ?? ''),
          agreedDueAt: deadline ? new Date(`${deadline}Z`).toISOString() : null,
        },
      })
      await onSaved()
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : 'Order changes couldn’t be saved.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        Edit order details
      </summary>
      <form className="mt-4 space-y-4" onSubmit={(event) => void save(event)}>
        <div className="space-y-2">
          <Label htmlFor="staff-topic">Topic</Label>
          <Input
            id="staff-topic"
            name="topic"
            defaultValue={order.title}
            minLength={4}
            maxLength={300}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <OrderLanguageField id="staff-order-language" value={language} onChange={setLanguage} />
          <div className="space-y-2">
            <Label htmlFor="staff-subject">Subject</Label>
            <Input
              id="staff-subject"
              name="subject"
              defaultValue={order.subject}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-style">Citation style</Label>
            <Input
              id="staff-style"
              name="style"
              defaultValue={order.style}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-sources">Number of sources</Label>
            <Input
              id="staff-sources"
              name="sources"
              type="number"
              min={0}
              max={100}
              defaultValue={order.sources}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-deadline">Agreed deadline (UTC)</Label>
            <Input
              id="staff-deadline"
              name="deadline"
              type="datetime-local"
              defaultValue={order.agreedDueAt?.slice(0, 16)}
            />
          </div>
        </div>
        <OrderSoftwareField
          id="staff-order-software"
          value={software}
          onChange={setSoftware}
          details={{ value: softwareDetails, onChange: setSoftwareDetails }}
          disabled={!editSoftware}
          fee={software === order.software ? order.softwareFeeCents / 100 : softwareWorkFee(order.level, order.deadlineOption)}
        />
        <div className="space-y-2">
          <Label htmlFor="staff-instructions">Instructions</Label>
          <Textarea
            id="staff-instructions"
            name="instructions"
            defaultValue={order.instructions}
            maxLength={20000}
            rows={5}
          />
        </div>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save order changes'}
        </Button>
      </form>
    </details>
  )
}
