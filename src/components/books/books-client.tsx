'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { BookFormDialog } from './book-form-dialog'
import { DeleteBookDialog } from './delete-book-dialog'
import { BookDetail } from './book-detail'
import type { Book } from '@/types'

export type BookEntryJoined = {
  id: string
  musician_id: string
  instrument_id: string
  chair_number: number | null
  priority: number
  notes: string | null
  musician: { id: string; first_name: string; last_name: string }
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
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingBook, setEditingBook] = useState<BookWithEntries | null>(null)
  const [deletingBook, setDeletingBook] = useState<BookWithEntries | null>(null)

  const canManage = userRole === 'owner' || userRole === 'admin'
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

  function handleSuccess() {
    setFormOpen(false)
    setDeleteOpen(false)
    setEditingBook(null)
    setDeletingBook(null)
    if (deletingBook && deletingBook.id === selectedBookId) {
      setSelectedBookId(null)
    }
    router.refresh()
  }

  function handleEntryChange() {
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Books</h2>
          <p className="text-muted-foreground">
            Manage personnel lists for your orchestra.
          </p>
        </div>
        {canManage && (
          <Button onClick={handleAdd}>Add Book</Button>
        )}
      </div>

      <Separator />

      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-4">
            No books have been added yet.
          </p>
          {canManage && (
            <Button onClick={handleAdd}>Add Your First Book</Button>
          )}
        </div>
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
                {books.map((book) => (
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
                          >
                            Edit
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
