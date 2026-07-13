'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { EmptyState } from '@/components/ui/empty-state'
import { BookFormDialog } from './book-form-dialog'
import { DeleteBookDialog } from './delete-book-dialog'
import { BookDetail } from './book-detail'
import { useTerms } from '@/components/providers/vertical-provider'
import { term } from '@/lib/verticals'
import type { Book } from '@/types'

export type BookEntryJoined = {
  id: string
  musician_id: string | null
  instrument_id: string
  chair_number: number | null
  priority: number
  notes: string | null
  musician: { id: string; first_name: string; last_name: string } | null
  instrument: { id: string; name: string; abbreviation: string | null; section: string | null; sort_order: number }
}

export type BookWithEntries = Book & {
  book_entries: BookEntryJoined[]
}

export type InstrumentOption = {
  id: string
  name: string
  abbreviation: string | null
  section: string | null
  sort_order: number
}

export type MusicianForDropdown = {
  id: string
  first_name: string
  last_name: string
  musician_instruments: { instrument_id: string }[]
}

interface BooksClientProps {
  books: BookWithEntries[]
  instruments: InstrumentOption[]
  musicians: MusicianForDropdown[]
  organizationId: string
  userRole: string
}

export function BooksClient({
  books,
  instruments,
  musicians,
  organizationId,
  userRole,
}: BooksClientProps) {
  const router = useRouter()
  const terms = useTerms()
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingBook, setEditingBook] = useState<BookWithEntries | null>(null)
  const [deletingBook, setDeletingBook] = useState<BookWithEntries | null>(null)

  // Filter state
  const [search, setSearch] = useState('')

  const canManage = userRole === 'owner' || userRole === 'admin'

  const hasFilters = search !== ''

  const filteredBooks = books.filter((b) => {
    if (search) {
      const q = search.toLowerCase()
      if (!b.name.toLowerCase().includes(q) && !(b.description || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const selectedBook = books.find((b) => b.id === selectedBookId) ?? null

  function handleAdd() {
    setEditingBook(null)
    setFormOpen(true)
  }

  function handleEdit(book: BookWithEntries) {
    setEditingBook(book)
    setFormOpen(true)
  }

  function handleDelete(book: BookWithEntries) {
    setDeletingBook(book)
    setDeleteOpen(true)
  }

  function handleSuccess(newBookId?: string) {
    setFormOpen(false)
    setDeleteOpen(false)
    setEditingBook(null)
    setDeletingBook(null)
    if (deletingBook && deletingBook.id === selectedBookId) {
      setSelectedBookId(null)
    }
    if (newBookId) {
      setSelectedBookId(newBookId)
    }
    router.refresh()
  }

  function handleEntryChange() {
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="page-header">
          <h2 className="text-3xl font-bold tracking-tight">{term(terms, 'groupList', { plural: true })}</h2>
          <p className="text-muted-foreground mt-1">
            Manage personnel lists for your orchestra.
          </p>
          <div className="mt-3 w-12 h-px bg-gold/50" />
        </div>
        {canManage && (
          <Button onClick={handleAdd}>Add Ensemble</Button>
        )}
      </div>

      <Separator />

      {books.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search ensembles..."
            className="rounded-md border bg-background px-3 py-2 text-sm w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch('')}
            >
              Clear
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filteredBooks.length} of {books.length} ensembles
          </span>
        </div>
      )}

      {books.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
          }
          title={`No ${term(terms, 'groupList', { plural: true, case: 'lower' })} yet`}
          description={`Save your go-to ${term(terms, 'person', { case: 'lower' })} lineups so you can quickly staff future ${term(terms, 'work', { plural: true, case: 'lower' })}.`}
          action={canManage ? <Button onClick={handleAdd}>Add Your First Ensemble</Button> : undefined}
        />
      ) : filteredBooks.length === 0 ? (
        <EmptyState title="No ensembles match your search" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Description</th>
                  <th className="px-4 py-3 text-left font-medium">Default</th>
                  <th className="px-4 py-3 text-left font-medium">Entries</th>
                  {canManage && (
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredBooks.map((book) => (
                  <tr
                    key={book.id}
                    className={`hover:bg-muted/50 cursor-pointer ${
                      selectedBookId === book.id ? 'bg-primary/5' : ''
                    }`}
                    onClick={() =>
                      setSelectedBookId((prev) => (prev === book.id ? null : book.id))
                    }
                  >
                    <td className="px-4 py-3 font-medium">{book.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {book.description
                        ? book.description.length > 50
                          ? book.description.slice(0, 50) + '...'
                          : book.description
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {book.is_default ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                          Default
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {book.book_entries.length}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div
                          className="flex items-center justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(book)}
                            title="Rename, add description, or set as default"
                          >
                            <svg
                              className="h-4 w-4 mr-1"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={1.5}
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                              />
                            </svg>
                            Settings
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(book)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedBook && (
            <BookDetail
              book={selectedBook}
              instruments={instruments}
              musicians={musicians}
              canManage={canManage}
              onEntryChange={handleEntryChange}
            />
          )}
        </>
      )}

      <BookFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        book={editingBook}
        organizationId={organizationId}
        onSuccess={handleSuccess}
      />

      <DeleteBookDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        book={deletingBook}
        onSuccess={handleSuccess}
      />
    </div>
  )
}
