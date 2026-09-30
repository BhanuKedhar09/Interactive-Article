# Interactive Article: Linking Text and Table

A single web page that connects an article to the data table it describes. Hovering a number in the text bolds it, fades the other paragraphs, and draws a thin curve to the matching table cell. Hovering a linked cell does the reverse. Only the section that needs to move scrolls, so the reader never loses their place.

## Run it

Open `index.html` in any modern browser. No build step or server is needed.

To serve it locally instead:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## How to use

- **Hover** an underlined number in the article, or a table cell with a small dot, to see the link.
- **Click** to hold the link in place; click again, click empty space, or press **Esc** to clear it.
- **Sort** the table by clicking any column header: ascending, descending, then back to the original order.
- **Keyboard:** Tab to a number or cell to link it, Enter to hold it, Esc to clear.

## Project structure

```
index.html        Page structure
css/styles.css    Layout and visual states
js/app.js         Rendering, linking, curve drawing, sorting
data/dataset.js   Table rows, column definitions, and article text
```

In the article text, `{{ROW.column|shown text}}` marks a mention of one table cell, so repeated values (for example two countries with the same life expectancy) always link to the intended row.

## Data

The dataset covers 46 countries and 8 columns, with an 8-paragraph article of about 1,700 words that mentions 95 table cells. The figures are rounded teaching values assembled for this project, not an official statistical release.

## Credits

The interaction follows the ideas of brushing and linking across coordinated views and context-preserving visual links between related items. No third-party code or libraries are used.
