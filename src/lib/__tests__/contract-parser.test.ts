import { describe, it, expect } from 'vitest'
import {
  parseContract,
  parseContractDate,
  readPerformanceTimes,
  contractDescription,
  contractPaymentNotes,
  isSameCompany,
} from '@/lib/projects/contract-parser'

// ---------------------------------------------------------------------------
// A whole 17hats contract page, pasted the way an admin pastes it: the CRM's
// menus on top, the labelled block, pages of terms, the signature footer.
// Same shape as the real contract this was built from; the client is fictional.
// ---------------------------------------------------------------------------
const CONTRACT = `
Search Contacts...

28

Dashboard
Contacts
Leads
Projects
Calendar
Pipelines
To Do
Documents
Workflow
Bookkeeping
MT
Contract for Marian Teller
Wedding sent
Send Reminder Live View Print Edit
Sent on Sep 29th, 2026 at 8:59 AM
Edited on Sep 29th, 2026 at 8:59 AM
Created on Sep 29th, 2026 at 8:57 AM
Due datein 4 days

THE PARTIES: The agreement is for entertainment services for the event described below, between the undersigned purchaser of entertainment (Client) and SUBITO STRINGS (Company).

SERVICES: SUBITO STRINGS agrees to provide client with the following Artist(s) and/or services:

Ensemble: String Quartet

Service: Wedding Ceremony and Coffee Hour

Client: Marian Teller

Date: 4/3/27

Venue: Invisible House

Performance Time: 8:30 AM guest arrival prelude music, ceremony at 9:00 AM, followed by coffee hour, to conclude by 11:00 AM. Musicians to arrive 30 minutes prior to guest arrival for setup at 8:00 AM.

Total Fee: $5,890
50% Deposit: $2,990

A minimum Deposit of 50% of total amount due required to bind terms (deposits are non-refundable).

Balance is due fourteen (14) days prior to the performance date.

Each musician will require one armless chair. If performance is outdoors, shade is required to protect instruments.

PERFORMANCE: It is understood that the Artist(s) executes this agreement as an independent contractor and is not an employee of the Client. A rest break of ten minutes from each hour or its equivalent is to be given to Artist(s).

REFUND/CANCEL: This agreement shall be null and void unless received by SUBITO STRINGS within seven (7) days of the agreement date.

OVERTIME: Overtime is calculated at $750 per hour per artist. Artist(s) availability is not guaranteed.
Marian Teller
 Sign Contract
Rebecca Chung
Rebecca Chung
  Signed Sep 29th, 2026
`

describe('parseContract: a whole pasted contract page', () => {
  const contract = parseContract(CONTRACT)

  it('reads who, what, when and where', () => {
    expect(contract.company).toBe('SUBITO STRINGS')
    expect(contract.ensemble).toBe('String Quartet')
    expect(contract.template).toBe('string-quartet')
    expect(contract.service).toBe('Wedding Ceremony and Coffee Hour')
    expect(contract.clientName).toBe('Marian Teller')
    expect(contract.date).toBe('2027-04-03')
    expect(contract.venueName).toBe('Invisible House')
    expect(contract.fieldsFound).toBe(8)
  })

  it('reads call, start and end out of the Performance Time sentence', () => {
    expect(contract.callTime).toBe('08:00')
    // The music starts with the prelude at 8:30, not the ceremony at 9:00.
    expect(contract.startTime).toBe('08:30')
    expect(contract.endTime).toBe('11:00')
  })

  it('reads the money and works out when the balance is due', () => {
    expect(contract.totalFee).toBe(5890)
    expect(contract.depositAmount).toBe(2990)
    expect(contract.depositPercent).toBe(50)
    expect(contract.balanceDueDays).toBe(14)
    expect(contract.balanceDueDate).toBe('2027-03-20')
  })

  it('is literal about the event type: coffee hour is not a cocktail hour', () => {
    expect(contract.eventType).toBe('Ceremony')
  })

  it('does not mistake the terms for the labelled block', () => {
    // "SERVICES:" and "PERFORMANCE:" are headings in the terms; the $750 overtime
    // rate is not the fee.
    expect(contract.service).not.toMatch(/agrees to provide/i)
    expect(contract.performanceTime).toMatch(/^8:30 AM guest arrival/)
    expect(contract.totalFee).not.toBe(750)
  })

  it('says out loud what a person should double-check', () => {
    expect(contract.clientSigned).toBe(false)
    expect(contract.warnings).toEqual([
      'The deposit is labelled 50% but $2,990 is not 50% of $5,890 (that would be $2,945). Both amounts are kept as written.',
      'The client has not signed this contract yet.',
    ])
  })

  it('words the description and the payment note for the form', () => {
    expect(contractDescription(contract)).toBe(
      'Wedding Ceremony and Coffee Hour\n\n' +
        '8:30 AM guest arrival prelude music, ceremony at 9:00 AM, followed by coffee hour, to conclude by 11:00 AM. ' +
        'Musicians to arrive 30 minutes prior to guest arrival for setup at 8:00 AM.'
    )
    expect(contractPaymentNotes(contract)).toBe(
      'Deposit $2,990 to hold the date. Balance $2,900 due Mar 20, 2027 (14 days before the gig).'
    )
  })
})

describe('parseContract: shapes the paste can take', () => {
  it('reads a value that the paste pushed onto the next line', () => {
    const contract = parseContract('Client:\n\nMarian Teller\nDate:\nApril 3, 2027\nVenue: Invisible House')
    expect(contract.clientName).toBe('Marian Teller')
    expect(contract.date).toBe('2027-04-03')
  })

  it('never takes the next label as a missing value', () => {
    const contract = parseContract('Client:\nDate: 4/3/27\nVenue: Invisible House')
    expect(contract.clientName).toBeNull()
    expect(contract.date).toBe('2027-04-03')
    expect(contract.warnings).toContain('No client name was found.')
  })

  it('handles Windows line endings and non-breaking spaces', () => {
    const contract = parseContract('Client: Marian Teller\r\nTotal Fee: $1,200.50\r\n')
    expect(contract.clientName).toBe('Marian Teller')
    expect(contract.totalFee).toBe(1200.5)
  })

  it('maps each ensemble to its template', () => {
    expect(parseContract('Ensemble: String Trio').template).toBe('string-trio')
    expect(parseContract('Ensemble: Violin & Cello Duo').template).toBe('duo')
    expect(parseContract('Ensemble: Solo Violin').template).toBe('solo')
  })

  it('warns when the ensemble has no template instead of guessing one', () => {
    const contract = parseContract('Ensemble: String Quintet\nClient: Marian Teller')
    expect(contract.template).toBeNull()
    expect(contract.warnings).toContain(
      'There is no template for "String Quintet". The gig is created without chairs. Add the positions yourself.'
    )
  })

  it('is quiet about a deposit that matches its label', () => {
    const contract = parseContract('Total Fee: $5,890\n50% Deposit: $2,945')
    expect(contract.warnings.some((w) => w.includes('labelled'))).toBe(false)
  })

  it('knows a contract both parties have signed', () => {
    const contract = parseContract('Client: Marian Teller\nMarian Teller\nSigned Oct 1st, 2026\nRebecca Chung\nSigned Sep 29th, 2026')
    expect(contract.clientSigned).toBe(true)
    expect(contract.warnings).not.toContain('The client has not signed this contract yet.')
  })

  it('says so when the text is not a contract at all', () => {
    for (const text of ['', '   ', 'Canon in D - Pachelbel\nPerfect - Ed Sheeran']) {
      const contract = parseContract(text)
      expect(contract.fieldsFound).toBe(0)
      expect(contract.warnings).toHaveLength(1)
      expect(contract.warnings[0]).toMatch(/No contract details were found/)
    }
  })
})

describe('parseContractDate', () => {
  it.each([
    ['4/3/27', '2027-04-03'],
    ['04/03/2027', '2027-04-03'],
    ['4-3-2027', '2027-04-03'],
    ['April 3, 2027', '2027-04-03'],
    ['Saturday, April 3rd 2027', '2027-04-03'],
    ['Sept. 12, 2026', '2026-09-12'],
    ['3 April 2027', '2027-04-03'],
    ['12/31/26', '2026-12-31'],
  ])('%s -> %s', (written, expected) => {
    expect(parseContractDate(written)).toBe(expected)
  })

  it.each(['2/30/27', '13/1/27', 'TBD', 'next spring'])('refuses %s', (written) => {
    expect(parseContractDate(written)).toBeNull()
  })
})

describe('readPerformanceTimes', () => {
  it('reads a plain range', () => {
    expect(readPerformanceTimes('5:00 PM - 7:00 PM')).toMatchObject({ startTime: '17:00', endTime: '19:00' })
  })

  it('lets the first half of a range borrow the AM/PM of the second', () => {
    expect(readPerformanceTimes('5:00 - 7:00 PM')).toMatchObject({ startTime: '17:00', endTime: '19:00' })
    expect(readPerformanceTimes('5-7pm')).toMatchObject({ startTime: '17:00', endTime: '19:00' })
    // 11 cannot be PM if the music ends at 1 PM.
    expect(readPerformanceTimes('11:00 - 1:00 PM')).toMatchObject({ startTime: '11:00', endTime: '13:00' })
  })

  it('starts at the earliest time even when the ceremony is named first', () => {
    const times = readPerformanceTimes('Ceremony at 5:00 PM with prelude music from 4:30 PM, concluding at 6:30 p.m.')
    expect(times).toMatchObject({ startTime: '16:30', endTime: '18:30' })
  })

  it('uses the stated lead time when no arrival time is given', () => {
    const times = readPerformanceTimes('4:30 PM to 6:30 PM. Musicians to arrive 45 minutes prior for setup.')
    expect(times.callTime).toBe('15:45')
    expect(times.warnings).toEqual([])
  })

  it('reads a lead time given in hours', () => {
    expect(readPerformanceTimes('4:30 PM to 6:30 PM. Quartet to arrive 1 hour before.').callTime).toBe('15:30')
  })

  it('assumes the usual half hour when the contract is silent, and says so', () => {
    const times = readPerformanceTimes('4:30 PM to 6:30 PM')
    expect(times.callTime).toBe('16:00')
    expect(times.warnings).toEqual([
      'The contract does not say when musicians arrive. Call time is set 30 minutes before the start. Change it if needed.',
    ])
  })

  it('flags an arrival time that contradicts its own lead time', () => {
    const times = readPerformanceTimes('4:30 PM to 6:30 PM. Musicians to arrive 30 minutes prior for setup at 3:30 PM.')
    expect(times.callTime).toBe('15:30')
    expect(times.warnings).toEqual([
      'The contract says musicians arrive 30 minutes before a 4:30 PM start, but gives 3:30 PM. Check the call time.',
    ])
  })

  it('does not read the guests arriving as the musicians arriving', () => {
    // "guest arrival" sits in the performance sentence; only the sentence about
    // the players sets the call time.
    const times = readPerformanceTimes('Guest arrival at 4:30 PM, ceremony at 5:00 PM, to end by 6:00 PM.')
    expect(times).toMatchObject({ startTime: '16:30', endTime: '18:00', callTime: '16:00' })
  })

  it('warns when there is only a start', () => {
    const times = readPerformanceTimes('Ceremony at 5:00 PM')
    expect(times).toMatchObject({ startTime: '17:00', endTime: null })
    expect(times.warnings).toContain('No end time could be read from the Performance Time. Set the end time yourself.')
  })

  it('warns when there are no times at all', () => {
    const times = readPerformanceTimes('To be confirmed with the planner')
    expect(times).toMatchObject({ callTime: null, startTime: null, endTime: null })
    expect(times.warnings).toEqual(['No start time could be read from the Performance Time. Set the times yourself.'])
  })

  it('does not put an after-midnight end before the start', () => {
    const times = readPerformanceTimes('9:00 PM to 12:30 AM')
    expect(times).toMatchObject({ startTime: '21:00', endTime: null })
    expect(times.warnings).toContain('The music runs past midnight, which the form cannot hold. Set the end time yourself.')
  })

  it('reads noon', () => {
    expect(readPerformanceTimes('11:00 AM until noon')).toMatchObject({ startTime: '11:00', endTime: '12:00' })
  })
})

describe('isSameCompany', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(isSameCompany('SUBITO STRINGS', 'Subito Strings')).toBe(true)
  })

  it('tells sister brands apart', () => {
    expect(isSameCompany('SUBITO STRINGS', 'Subito String Quartet')).toBe(false)
    expect(isSameCompany('SUBITO STRINGS', 'Project String Quartet')).toBe(false)
  })
})
