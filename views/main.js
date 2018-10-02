function addEventListenerPromise(target, type, listener) {
    return new Promise((res, rej) => target.addEventListener(type, (e) => res(listener(e))));
}

async function calcTextDecklist(str, date) {
    return (new Decklist()).convertFromJSON(await fetch(`/calc?decklist=${encodeURIComponent(str)}&date=${date.toISOString()}`).then((r) => r.json()));
}

document.addEventListener('DOMContentLoaded', load);

function load() {
    const dl_form = document.getElementById('decklist_form');
    const dl_text = dl_form.decklist_text;
    const dl_files = dl_form.decklist_files;

    dl_text.value = localStorage.getItem('decklist_text') || '';

    dl_files.addEventListener('change', readDeckFromFile);

    async function calcTextDeck(name, str) {
        const base = document.getElementById('date');

        const date = base.value == ""?new Date():new Date(base.value);
        return new Deck(name, await calcTextDecklist(str, date), date);
    }


    async function readDeckFromFile() {
        for(const file of Array.from(dl_files.files)) {
            const reader = new FileReader();
            const resultPromise = addEventListenerPromise(reader, 'load', (e) => e.target.result);
            reader.readAsText(file);
            updateTable(await calcTextDeck(file.name, await resultPromise));
        }
    }


    const calc_button = document.getElementById('calc');
    calc_button.addEventListener('click', async (e) => {
        updateTable(await calcTextDeck('text', dl_text.value));
        readDeckFromFile();

        localStorage.setItem('decklist_text', dl_text.value);
    });

    const reload_button = document.getElementById('reload');
    reload_button.addEventListener('click', readDeckFromFile);

}

function deckToTable(deck) {
    const table = document.createElement('table');
    table.id = deck.name;

    const mainPrice = deck.decklist.main.map((c) => c.price_sum).reduce((acc, cur) => acc + cur, 0);
    const sidePrice = deck.decklist.sideboard.map((c) => c.price_sum).reduce((acc, cur) => acc + cur, 0);

    table.createTHead();

    const boardRow = table.tHead.insertRow();
    const mainCell = boardRow.insertCell();
    mainCell.colSpan = 4;
    mainCell.appendChild(document.createTextNode(`Mainboard ${mainPrice.toFixed(3)} Tix`));
    const sideCell = boardRow.insertCell();
    sideCell.colSpan = 4;
    sideCell.appendChild(document.createTextNode(`Sideboard ${sidePrice.toFixed(3)} Tix`));

    const cardDataRow = table.tHead.insertRow();
    for(let i = 0; i < 2; i++) {
        for(const h of ['Num', 'Name', 'Price', 'Sum']) {
            cardDataRow.insertCell().appendChild(document.createTextNode(h));
        }
    }

    for(let i = 0; i < Math.max(deck.decklist.main.length, deck.decklist.sideboard.length); i++) {
        const row = table.insertRow();
        if(i < deck.decklist.main.length) {
            const card = deck.decklist.main[i];
            row.insertCell().appendChild(document.createTextNode(card.number));
            row.insertCell().appendChild(document.createTextNode(card.name));
            row.insertCell().appendChild(document.createTextNode(card.price.toFixed(3)));
            row.insertCell().appendChild(document.createTextNode(card.price_sum.toFixed(3)));
        } else {
            for(let j = 0; j < 6; j++) {
                row.insertCell().appendChild(document.createTextNode(''));
            }
        }
        if(i < deck.decklist.sideboard.length) {
            const card = deck.decklist.sideboard[i];
            row.insertCell().appendChild(document.createTextNode(card.number));
            row.insertCell().appendChild(document.createTextNode(card.name));
            row.insertCell().appendChild(document.createTextNode(card.price.toFixed(3)));
            row.insertCell().appendChild(document.createTextNode(card.price_sum.toFixed(3)));
        }
    }

    const totalPrice = mainPrice + sidePrice;
    table.createCaption();
    const date = `${deck.date.getFullYear()}-${deck.date.getMonth() + 1}-${deck.date.getDate()}`;
    table.caption.innerText = `${deck.name} total ${totalPrice.toFixed(3)} tix (${date})`;
    return table;
}

function updateTable(deck) {
    const tables = document.getElementById('priceTables');
    const oldTable = document.getElementById(deck.name);
    const newTable = deckToTable(deck);

    if(oldTable) oldTable.parentElement.replaceChild(newTable, oldTable);
    else tables.insertBefore(newTable, tables.firstChild)
}
