"""Browser checks for the reimbursement tracker against fictional YNAB responses.
Run a dev server first, then: python tests/reimbursements_smoke.py
Uses the same APP_URL, CHROMIUM_PATH and SCREENSHOT_DIR settings as browser_smoke.py.
"""
from datetime import datetime, timezone
from pathlib import Path
import json
import os
from playwright.sync_api import sync_playwright, expect

ARTIFACTS = Path(os.environ.get('SCREENSHOT_DIR', '/tmp/budget-clarity-screenshots'))
ARTIFACTS.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('APP_URL', 'http://127.0.0.1:5000')
MONTHS = ['2026-07-01', '2026-08-01', '2026-09-01']
GROUPS = [{'id': 'g1', 'name': 'Everyday', 'hidden': False, 'deleted': False}]
CATEGORIES = [
    {'id': 'groceries', 'name': 'Groceries'},
    {'id': 'reimb', 'name': 'Getting Reimbursed'},
]
META = [{**c, 'category_group_id': 'g1', 'category_group_name': 'Everyday', 'hidden': False, 'deleted': False,
         'budgeted': 0, 'activity': 0, 'balance': 0, 'goal_type': None, 'goal_target': None,
         'goal_cadence': None, 'goal_months_to_budget': None} for c in CATEGORIES]


def tx(id, date, dollars, payee, memo=None, parent=None):
    return {'id': id, 'date': date, 'amount': round(dollars * 1000), 'memo': memo, 'cleared': 'cleared',
            'approved': True, 'flag_color': None, 'account_id': 'a', 'account_name': 'Checking',
            'payee_id': None, 'payee_name': payee, 'category_id': 'reimb', 'transfer_account_id': None,
            'deleted': False, 'type': 'subtransaction' if parent else 'transaction',
            'parent_transaction_id': parent}


TRANSACTIONS = [
    tx('dinner', '2026-07-02', -250, 'Olive Garden', 'Covered dinner for 4'),
    tx('v1', '2026-07-05', 62.5, 'Venmo', 'dinner'),
    tx('v2', '2026-07-09', 62.5, 'Venmo', 'dinner'),
    # As in YNAB, a split part has no payee; it comes from the parent.
    tx('groceries', '2026-10-19', -54.10, None, None, parent='p1'),
    tx('gas', '2026-10-24', -32.30, 'Shell', 'Cabin trip'),
    tx('holden', '2026-10-26', 86.40, 'Venmo', 'tj + gas'),
    tx('return', '2026-09-03', 19.99, 'Amazon', 'Returned charger'),
    tx('gift', '2026-08-15', -40, 'Ticketmaster', 'Holden ticket'),
]
since = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), headless=True,
                                args=['--no-sandbox', '--disable-dev-shm-usage'])
    context = browser.new_context(viewport={'width': 1440, 'height': 1250}, accept_downloads=True)
    page = context.new_page()
    page.clock.install(time=datetime(2026, 10, 30, 12, tzinfo=timezone.utc))
    errors, writes = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))

    def api(route):
        request = route.request
        if request.method != 'GET': writes.append(request.method)
        path = request.url.split('/v1')[1]
        if path == '/budgets':
            result = {'budgets': [{'id': 'mock-budget', 'name': 'Personal budget'}]}
        elif path.endswith('/categories'):
            result = {'category_groups': [{**GROUPS[0], 'categories': META}]}
        elif path.endswith('/months'):
            result = {'months': [{'month': m} for m in MONTHS]}
        elif '/months/' in path:
            result = {'month': {'month': path.split('/')[-1], 'income': 0, 'budgeted': 0, 'activity': 0,
                                'categories': [{**c, 'activity': -100000} for c in META]}}
        elif '/categories/reimb/transactions' in path:
            since.append(path.split('since_date=')[1])
            result = {'transactions': TRANSACTIONS, 'server_knowledge': 1}
        elif path.startswith('/budgets/mock-budget/transactions?since_date='):
            result = {'transactions': [{'id': 'p1', 'payee_name': "Trader Joe's", 'memo': 'Holden half'}],
                      'server_knowledge': 1}
        else: raise AssertionError(path)
        route.fulfill(json={'data': result})
    page.route('https://api.ynab.com/v1/**', api)
    page.add_init_script("""if(!sessionStorage.getItem('fixture-seeded')){
      localStorage.setItem('ynab_api_token','fictional-test-token');
      localStorage.setItem('ynab_selected_budget','mock-budget');
      sessionStorage.setItem('fixture-seeded','yes');
    }""")
    page.goto(BASE)
    # The category is found by name and its open total shows on the main page.
    expect(page.get_by_role('button', name='Reimbursements $376 owed', exact=True)).to_be_visible()
    page.get_by_role('button', name='Reimbursements $376 owed', exact=True).click()
    assert since[-1] == '2026-06-01', since
    expect(page.locator('#reimb-owed')).to_have_text('$376.40')
    expect(page.get_by_role('combobox', name='Category')).to_have_value('reimb')
    assert 'Refund or credit' in page.locator('.reimb-side').inner_text()
    assert 'Split' in page.locator('.reimb-out').inner_text()
    assert "Trader Joe's" in page.locator('.reimb-out').inner_text()
    assert 'Holden half' in page.locator('.reimb-out').inner_text()

    # One Venmo pays back two items.
    page.get_by_role('checkbox', name="Select Trader Joe's on Oct 19, $54.10").check()
    page.get_by_role('checkbox', name='Select Shell on Oct 24, $32.30').check()
    page.locator('.reimb-in', has_text='tj + gas').get_by_role('checkbox').check()
    expect(page.locator('.reimb-allocs li')).to_have_count(2)
    page.get_by_role('button', name='Mark as reimbursed').click()
    expect(page.locator('#reimb-owed')).to_have_text('$290.00')

    # Two Venmos pay part of one dinner; the rest stays open.
    page.get_by_role('checkbox', name='Select Olive Garden on Jul 2, $250.00').check()
    for memo in ['Jul 5', 'Jul 9']:
        page.locator('.reimb-in', has_text=memo).get_by_role('checkbox').check()
    assert '$125.00 stays open' in page.locator('.reimb-match').inner_text()
    page.screenshot(path=str(ARTIFACTS / 'reimbursements-matching.png'), full_page=True)
    page.get_by_role('button', name='Mark as reimbursed').click()
    expect(page.locator('#reimb-owed')).to_have_text('$165.00')
    expect(page.get_by_role('checkbox', name='Select Olive Garden on Jul 2, $125.00')).to_be_visible()

    # Edited amounts are validated before saving.
    page.get_by_role('checkbox', name='Select Olive Garden on Jul 2, $125.00').check()
    page.locator('.reimb-in', has_text='Amazon').get_by_role('checkbox').check()
    page.locator('.reimb-allocs input').fill('30')
    expect(page.locator('.reimb-problem')).to_contain_text('only 19.99 left')
    page.get_by_role('button', name='Clear').click()

    # Something not coming back is written off.
    page.get_by_role('button', name='Ignore Ticketmaster on Aug 15').click()
    expect(page.locator('#reimb-owed')).to_have_text('$125.00')
    assert '$40.00' in page.locator('.reimb-summary').inner_text()

    # Matches persist across reloads, and a backup can be exported.
    page.reload()
    page.get_by_role('button', name='Reimbursements $125 owed', exact=True).click()
    expect(page.locator('#reimb-owed')).to_have_text('$125.00')
    with page.expect_download() as download:
        page.get_by_role('button', name='Export backup').click()
    backup = json.loads(Path(download.value.path()).read_text())
    assert backup['kind'] == 'budget-clarity-reimbursements' and len(backup['data']['matches']) == 2

    # A matched payment leaving the category asks for review instead of vanishing.
    TRANSACTIONS[:] = [t for t in TRANSACTIONS if t['id'] != 'v2']
    page.get_by_role('button', name='Refresh', exact=True).click()
    expect(page.locator('.reimb-review')).to_contain_text('Venmo (Jul 9, $62.50) is no longer in Getting Reimbursed')
    expect(page.locator('#reimb-owed')).to_have_text('$187.50')
    page.screenshot(path=str(ARTIFACTS / 'reimbursements-review.png'), full_page=True)
    page.get_by_role('button', name='Keep the rest of the match').click()
    expect(page.locator('.reimb-review')).to_have_count(0)
    expect(page.locator('#reimb-owed')).to_have_text('$187.50')

    # Undo returns a match to open; import restores the backup.
    page.locator('.reimb-history summary', has_text='Reimbursed').click()
    page.locator('.reimb-history li', has_text='Shell').get_by_role('button', name='Undo').click()
    expect(page.locator('#reimb-owed')).to_have_text('$273.90')
    page.once('dialog', lambda d: d.accept())
    page.locator('input[type=file]').set_input_files(download.value.path())
    expect(page.get_by_role('status')).to_have_text('Backup restored.')

    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(ARTIFACTS / 'reimbursements-mobile.png'), full_page=True)
    assert not errors, errors
    assert not writes, writes
    print('Reimbursement checks passed: category detection, split rows, multi-item and partial matches, validation, ignore, persistence, export/import, review on missing transactions, undo, mobile. No YNAB writes.')
    browser.close()
