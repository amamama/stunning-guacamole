class JSONConvertable {
    convertToJSONString() {
        return JSON.stringify(this);
    }

    convertToJSON() {
        return JSON.parse(this.convertToJSONString());
    }

    convertFromJSON(json) {
        if(!json) return this;
        for(const k in this) this[k] = json[k];
        return this;
    }
}

class CardFace extends JSONConvertable {
    constructor(name, manaCost, cmc, type, oracle, colors, colorId) {
        this.name = name;
        this.manaCost = manaCost;
        this.cmc = cmc;
        this.type = type;
        this.oracle = oracle;
        this.colors = colors;
        this.colorId = colorId;
    }
}

class Card extends JSONConvertable {
    constructor(name, number) {
        super(); //for super class. its redundant
        this.name = name;
        this.number = number || 1;
    }
}

class CardWithPrice extends Card {
    constructor(name, number, price, cardFaces) {
        super(name, number);
        this.price = price;
        this.price_sum = price * this.number;
        this.cardFaces = cardFaces;
    }
}

class Decklist extends JSONConvertable {
    get decklist() {
        return this.dlist;
    }

    set decklist(s) {
        this.dlist = s;
        if(this.validateDecklist()) this.parseDecklist();
        return s;
    }

    constructor(main, side) {
        super(); //for super class. its redundant
        if(typeof main == 'string') {
            this.decklist = main;
        } else {
            this.main = main;
            this.sideboard = side;
        }
    }

    validateDecklist() {
        if(!this.decklist) return this;
        const matched = this.decklist.match(/^(\d+\s+[^\r\n]+|(S|s)ideboard|\B)((\r\n|\n)(\d+\s+[^\r\n]+|(S|s)ideboard|\B))*$/);
        if(!matched) {
            return false;
        }
        return true;
    }

    parseDecklist() {
        if(!this.decklist) return this;
        //-> [{main: str, sideboard: str}]
        //-> [{main: [name:str, number: int], sideboard: [~]}]
        //-> [{main: [~], sideboard: [~]}]
         [this.main, this.sideboard] = this.decklist.match(/(\d+\s+[^\r\n]+)((\r\n|\n)(\d+\s+[^\r\n]+))*/g).map((s) => {
            return s.match(/\d+\s+[^\r\n]+/g).map((s) => {
                const [number, name] = s.match(/(\d+)\s+([^\r\n]+)/).slice(1, 3);
                return new Card(name, parseInt(number));
            });
        });
        this.sideboard = this.sideboard || [];
        return this;
    }

    convertFromJSON(json) {
        super.convertFromJSON(json);
        this.main = this.main.map(convertCard);
        this.sideboard = this.sideboard.map(convertCard);
        function convertCard(json) {
            if(!json) return null;
            if('price' in json) return (new CardWithPrice()).convertFromJSON(json);
             return (new Card()).convertFromJSON(json);
        }
        return this;
    }
}

class Deck extends JSONConvertable {
    constructor(name, decklist) {
        super(); //for super class. its redundant
        this.name = name;
        this.decklist = decklist;
    }

    convertFromJSON(json) {
        super.convertFromJSON(json);
        this.decklist = (new Decklist()).convertFromJSON(this.decklist);
        return this;
    }
}

class DeckWithDate extends Deck {
    constructor(name, decklist, date = new Date()) {
        super(name, decklist);
        this.date = date;
    }

    convertFromJSON(json) {
        super.convertFromJSON(json);
        this.date = new Date(this.date);
        return this;
    }
}

if(typeof module !== 'undefined')
module.exports = {
    CardFace,
    Card,
    CardWithPrice,
    Decklist,
    Deck,
    DeckWithDate
};
