const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

/* CREATE EXPRESS APP */
const app = express();
const PORT = 3000;

/* MIDDLEWARE */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* SERVE HTML FILES */
app.use(express.static(__dirname));

/* DATABASE */
const db = new sqlite3.Database("./db.sqlite", (err) => {
    if (err) {
        console.error("Database error:", err.message);
    } else {
        console.log("SQLite connected");
    }
});
db.serialize();
db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA busy_timeout = 5000;");

/* MYSQL COMPATIBILITY WRAPPER */
db.query = function(sql, params, callback){

    if(typeof params === "function"){
        callback = params;
        params = [];
    }

    const isSelect = sql.trim().toLowerCase().startsWith("select");

    if(isSelect){
        db.all(sql, params, callback);
    }else{
        db.run(sql, params, function(err){
            if(callback){
                callback(err,{
                    insertId: this.lastID,
                    changes: this.changes
                });
            }
        });
    }
};
    

/* ====================================================
   COVER MASTER (MODEL NAME)
==================================================== */

// Get all model names
app.get('/api/get_models', (req, res) => {

    const sql = "SELECT * FROM model_name ORDER BY model_name ASC";

    db.all(sql, [], (err, rows) => {

        if (err) {
            console.log(err);
            return res.status(500).json(err);

        }

        res.json(rows);

    });

});

// Add new model
app.post('/api/add_model', (req, res) => {
    const { model_name } = req.body;

    if (!model_name) {
        return res.status(400).json({ error: "Model name required" });
    }

    const sql = "INSERT INTO model_name (model_name) VALUES (?)";

    db.query(sql, [model_name], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "Duplicate or DB error" });
        }
        res.json({ message: "Model saved successfully" });
    });
});

/* ====================================================
   DROPDOWN DATA APIs
==================================================== */

app.get('/api/parties', (req, res) => {
    db.query("SELECT * FROM party_name ORDER BY party_name ASC", (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

app.get('/api/pl_dx', (req, res) => {
    db.query("SELECT * FROM type_1 ORDER BY type_1 ASC", (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

app.get('/api/lq_pc', (req, res) => {
    db.query("SELECT * FROM type_2 ORDER BY type_2 ASC", (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

/* ====================================================
   SAVE COVER ORDER (MASTER + DETAILS)
==================================================== */

app.post('/api/save_cover', (req, res) => {

    const { received_date, delivery_date, party_id, items } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items provided" });
    }

    const masterSql = `
        INSERT INTO cover_orders (received_date, delivery_date, party_id)
        VALUES (?, ?, ?)
    `;

    db.run(masterSql, [received_date, delivery_date, party_id], function(err){

        if (err) {
            console.log("Master Insert Error:", err);
            return res.status(500).json(err);
        }

        const orderId = this.lastID;

        const detailSql = `
            INSERT INTO cover_order_details
            (order_id, model_id, pl_dx, lq_pc, colours, qty, units)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        let completed = 0;

        items.forEach(item => {

            db.run(
                detailSql,
                [
                    orderId,
                    item.model_id,
                    item.pl_dx,
                    item.lq_pc,
                    item.colours,
                    item.qty,
                    item.units
                ],
                function(err2){

                    if(err2){
                        console.log("Detail Insert Error:", err2);
                    }

                    completed++;

                    if(completed === items.length){
                        res.json({ message: "Saved Successfully" });
                    }

                }
            );

        });

    });

});
/* =========================
   SEARCH MODEL
========================= */
app.get('/api/search_models', (req, res) => {
    const search = req.query.search || "";

    const sql = `
        SELECT * FROM model_name 
        WHERE model_name LIKE ?
        ORDER BY model_name ASC
    `;

    db.query(sql, [`%${search}%`], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

/* =========================
   UPDATE MODEL
========================= */
app.put('/api/update_model/:id', (req, res) => {
    const id = req.params.id;
    const { model_name } = req.body;

    const sql = "UPDATE model_name SET model_name=? WHERE id=?";

    db.query(sql, [model_name, id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Model updated successfully" });
    });
});

/* =========================
   DELETE MODEL
========================= */
app.delete('/api/delete_model/:id', (req, res) => {
    const id = req.params.id;

    db.query("DELETE FROM model_name WHERE id=?", [id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Model deleted successfully" });
    });
});

app.get('/api/get_colourss', (req,res)=>{
    db.query("SELECT DISTINCT colours FROM cover_order_details",(err,result)=>{
    res.json(result);
    });
    });

/* =========================
   GET ALL PARTIES
========================= */
app.get('/api/get_parties', (req, res) => {
    db.query("SELECT * FROM party_name ORDER BY party_name ASC", (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

/* =========================
   ADD PARTY
========================= */
app.post('/api/add_party', (req, res) => {
    const { party_name } = req.body;

    db.query("INSERT INTO party_name (party_name) VALUES (?)",
        [party_name],
        (err, result) => {
            if (err) return res.status(500).json({ error: "Duplicate or DB error" });
            res.json({ message: "Party added successfully" });
        });
});

/* =========================
   UPDATE PARTY
========================= */
app.put('/api/update_party/:id', (req, res) => {
    const id = req.params.id;
    const { party_name } = req.body;

    db.query("UPDATE party_name SET party_name=? WHERE id=?",
        [party_name, id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Party updated successfully" });
        });
});

/* =========================
   DELETE PARTY
========================= */
app.delete('/api/delete_party/:id', (req, res) => {
    const id = req.params.id;

    db.query("DELETE FROM party_name WHERE id=?",
        [id],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Party deleted successfully" });
        });
});

/* =========================
   SEARCH PARTY
========================= */
app.get('/api/search_parties', (req, res) => {
    const search = req.query.search || "";

    db.query(
        "SELECT * FROM party_name WHERE party_name LIKE ? ORDER BY party_name ASC",
        [`%${search}%`],
        (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        }
    );
});

/* =========================
   SHOW COVER REPORT
========================= */
/* =========================
   SUMMARY REPORT
========================= */
/* =========================
   SHOW COVER VOUCHERS (FIXED FOR TEXT STORAGE)
========================= */
app.get('/api/show_vouchers', (req, res) => {

    const sql = `
    SELECT 
        co.id AS voucher_id,
        co.received_date,
        co.delivery_date,

        /* If party_id contains text, show it directly */
        COALESCE(p.party_name, co.party_id) AS party_name,

        /* If model_id contains text, show it directly */
        COALESCE(m.model_name, cod.model_id) AS model_name,

        cod.pl_dx,
        cod.lq_pc,
        cod.colours,
        cod.qty,
        cod.units

    FROM cover_orders co

    LEFT JOIN cover_order_details cod 
        ON co.id = cod.order_id

    /* Works for both numeric ID or text */
    LEFT JOIN party_name p 
        ON co.party_id = p.id 
        OR co.party_id = p.party_name

    LEFT JOIN model_name m 
        ON cod.model_id = m.id 
        OR cod.model_id = m.model_name

    ORDER BY co.id DESC
    `;

    db.all(sql, [], (err, rows) => {

        if (err) {
            console.log(err);
            return res.status(500).json(err);
        }

        res.json(rows);
    });

});
// GET all blade parties
app.get('/api/blade_parties', (req, res) => {

    const sql = `SELECT id, party_name FROM blade_parties ORDER BY party_name`;

    db.query(sql, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json([]);
        }
        res.json(result);
    });

});

// INSERT blade party
app.post('/api/blade_parties', (req, res) => {
    const { party_name } = req.body;

    const sql = "INSERT INTO blade_parties (party_name) VALUES (?)";
    db.query(sql, [party_name], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Saved successfully" });
    });
});

// UPDATE blade party
app.put('/api/blade_parties/:id', (req, res) => {
    const { id } = req.params;
    const { party_name } = req.body;

    const sql = "UPDATE blade_parties SET party_name=? WHERE id=?";
    db.query(sql, [party_name, id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Updated successfully" });
    });
});

// DELETE blade party
app.delete('/api/blade_parties/:id', (req, res) => {
    const { id } = req.params;

    const sql = "DELETE FROM blade_parties WHERE id=?";
    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json({ message: "Deleted successfully" });
    });
});

app.post('/api/save_blade_order', (req, res) => {

    const { received_date, delivery_date, party_id, total_qty, units, items } = req.body;

    if (!received_date || !delivery_date || !party_id || !items.length) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const insertOrder = `
        INSERT INTO blade_orders 
        (received_date, delivery_date, party_id, total_qty, units)
        VALUES (?, ?, ?, ?, ?)
    `;

    db.run(insertOrder, [received_date, delivery_date, party_id, total_qty, units], function(err) {

        if (err) {
            console.error("Order insert error:", err);
            return res.status(500).json({ message: "Order insert failed" });
        }

        const orderId = this.lastID;

        const insertDetail = `
            INSERT INTO blade_order_details
            (order_id, model_id, pl_dx, lq_pc, colours, qty, units, box, stc, trims)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        let completed = 0;
        let hasError = false;

        if (items.length === 0) {
            return res.json({ message: "Blade order saved successfully" });
        }

        items.forEach(item => {
            db.run(
                insertDetail,
                [orderId, item.model_id, item.pl_dx, item.lq_pc, item.colours,
                 item.qty, item.units, item.box, item.stc, item.trims],
                function(err2) {
                    if (err2 && !hasError) {
                        hasError = true;
                        console.error("Detail insert error:", err2);
                        return res.status(500).json({ message: "Details insert failed" });
                    }
                    completed++;
                    if (completed === items.length && !hasError) {
                        res.json({ message: "Blade order saved successfully" });
                    }
                }
            );
        });

    });
});

app.get('/api/blade_models', (req, res) => {

    const sql = "SELECT id, model_name FROM blade_models ORDER BY model_name";

    db.query(sql, (err, results) => {
        if (err) {
            console.error("Blade Models Error:", err);
            return res.status(500).json({ message: "Database error" });
        }

        res.json(results);
    });

});


app.get('/api/blade_vouchers_by_date/:date', (req, res) => {

    const sql = `
        SELECT 
            bo.id AS order_id,
            bo.received_date,
            bo.delivery_date,
            bo.total_qty,
            bo.units,
            bp.party_name,
            bod.pl_dx,
            bod.lq_pc,
            bod.colours,
            bod.qty,
            bod.units AS row_units,
            bod.box,
            bod.stc,
            bod.trims
        FROM blade_orders bo
        JOIN blade_order_details bod ON bo.id = bod.order_id
        JOIN blade_parties bp ON bo.party_id = bp.id
        WHERE DATE(bo.received_date) = ?
        ORDER BY bo.id ASC
    `;

    db.query(sql, [req.params.date], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(results);
    });

});

app.post('/save_blade', (req, res) => {

    const {
        party_name,
        received_date,
        delivery_date,
        total_qty,
        total_units,
        items
    } = req.body;

    // Generate next voucher number
    const voucherSql = `SELECT IFNULL(MAX(voucher_no),0)+1 AS nextVoucher FROM blade_orders`;

    db.query(voucherSql, (err, result) => {

        if (err) return res.status(500).json(err);

        const voucherNo = result[0].nextVoucher;

        const masterSql = `
            INSERT INTO blade_orders
            (voucher_no, party_name, received_date, delivery_date, total_qty, total_units)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        db.query(masterSql,
            [voucherNo, party_name, received_date, delivery_date, total_qty, total_units],
            (err2, result2) => {

            if (err2) return res.status(500).json(err2);

            const orderId = result2.insertId;

            // Filter empty rows
            const validItems = items.filter(item =>
                item.model_name && item.qty && item.qty > 0
            );

            if (validItems.length === 0) {
                return res.json({ message: "Voucher Saved (No items)" });
            }

            const insertDetail = `
                INSERT INTO blade_order_details
                (order_id, model_name, pl_dx, lq_pc, colours, qty, units, box, stc, trims)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            let completed = 0;
            let hasError = false;

            validItems.forEach(item => {
                db.run(insertDetail,
                    [orderId, item.model_name, item.pl_dx, item.lq_pc, item.colours,
                     item.qty, item.units, item.box, item.stc, item.trims],
                    function(err3) {
                        if (err3 && !hasError) {
                            hasError = true;
                            return res.status(500).json(err3);
                        }
                        completed++;
                        if (completed === validItems.length && !hasError) {
                            res.json({ message: "Voucher Saved Successfully" });
                        }
                    }
                );
            });

        });

    });

});

app.get('/api/blade_packing', (req, res) => {

    const sql = `
        SELECT 
            bo.voucher_no,
            bo.party_name,
            bo.received_date,
            bo.delivery_date,
            bo.total_qty,
            bo.total_units,

            bd.model_name,
            bd.pl_dx,
            bd.lq_pc,
            bd.colours,
            bd.qty,
            bd.units,
            bd.box,
            bd.stc,
            bd.trims

        FROM blade_orders bo
        JOIN blade_order_details bd 
            ON bo.id = bd.order_id

        ORDER BY bo.voucher_no, bd.id
    `;

    db.query(sql, (err, result) => {
        if (err) {
            console.log(err);
            return res.status(500).json([]);
        }
        res.json(result);
    });

});

/* =========================
   BLADE PACKING REPORT
========================= */
/* =========================
   BLADE PACKING REPORT
   (No LQ/PC Filter)
========================= */
app.get('/api/blade_packing_range', (req,res)=>{

    const { from, to } = req.query;

    const sql = `
        SELECT 
            o.id,
            o.voucher_no,
            o.party_name,
            o.received_date,
            o.delivery_date,
            d.model_name,
            d.pl_dx,
            d.lq_pc,
            d.colours,
            d.qty,
            d.units,
            d.box,
            d.stc,
            d.trims
        FROM blade_orders o
        JOIN blade_order_details d 
            ON o.id = d.order_id
        WHERE DATE(o.received_date) BETWEEN ? AND ?
        ORDER BY o.voucher_no, d.id
    `;

    db.query(sql,[from,to],(err,result)=>{
        if(err){
            console.log("Packing Report Error:", err);
            return res.status(500).json([]);
        }
        res.json(result);
    });
});


/* =========================
   BLADE CUTTING REPORT
   (No LQ/PC Filter)
========================= */
app.get('/api/blade_cutting_range', (req,res)=>{

    const { from, to } = req.query;

    const sql = `
        SELECT *
        FROM blade_orders o
        JOIN blade_order_details d 
            ON o.id = d.order_id
        WHERE DATE(o.received_date) BETWEEN ? AND ?
        ORDER BY o.voucher_no, d.id
    `;

    db.query(sql,[from,to],(err,result)=>{
        if(err){
            console.log("Cutting Report Error:", err);
            return res.status(500).json([]);
        }
        res.json(result);
    });
});


/* =========================
   BLADE PAINTING REPORT
   ONLY LQ (Safe Filter)
========================= */
app.get('/api/blade_painting_range', (req,res)=>{

    const { from, to } = req.query;

    const sql = `
        SELECT d.*, o.voucher_no, o.received_date, o.delivery_date, o.party_name
        FROM blade_order_details d
        JOIN blade_orders o ON d.order_id = o.id
        WHERE o.received_date BETWEEN ? AND ?
        AND UPPER(TRIM(d.lq_pc)) = 'LQ'
        ORDER BY o.received_date, o.voucher_no
    `;

    db.query(sql, [from, to], (err,result)=>{
        if(err){
            console.error(err);
            return res.status(500).send("Database error");
        }
        res.json(result);
    });
});

/* =========================
   BLADE POWDERING REPORT
   ONLY PC (Safe Filter)
========================= */
app.get('/api/blade_powdering_range', (req,res)=>{

    const { from, to } = req.query;

    if(!from || !to){
        return res.json([]);
    }

    const sql = `
        SELECT 
            d.*, 
            o.voucher_no,
            o.party_name,
            o.received_date,
            o.delivery_date
        FROM blade_order_details d
        JOIN blade_orders o ON d.order_id = o.id
        WHERE o.received_date BETWEEN ? AND ?
        AND UPPER(TRIM(d.lq_pc)) = 'PC'
        ORDER BY o.received_date, o.voucher_no
    `;

    db.query(sql, [from, to], (err,result)=>{
        if(err){
            console.error(err);
            return res.status(500).send("Database error");
        }
        res.json(result);
    });
});
app.get('/api/blade_packing_by_voucher/:voucherNo', (req, res) => {

    const voucherNo = req.params.voucherNo;

    const sql = `
        SELECT 
            bo.voucher_no,
            bo.party_name,
            bo.received_date,
            bo.delivery_date,
            bo.total_qty,
            bo.total_units,
            bd.model_name,
            bd.pl_dx,
            bd.lq_pc,
            bd.colours,
            bd.qty,
            bd.units,
            bd.box,
            bd.stc,
            bd.trims
        FROM blade_orders bo
        JOIN blade_order_details bd ON bo.id = bd.order_id
        WHERE bo.delivery_date = (
            SELECT delivery_date 
            FROM blade_orders 
            WHERE voucher_no = ?
            LIMIT 1
        )
        ORDER BY bo.voucher_no, bd.id
    `;

    db.query(sql, [voucherNo], (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });

});
           
/* =========================
   GET BLADE VOUCHER FOR EDIT
========================= */
app.get('/api/blade_voucher/:voucherNo', (req,res)=>{

    const voucherNo = req.params.voucherNo;

    const sql = `
        SELECT 
            bo.id,
            bo.voucher_no,
            bo.party_name,
            bo.received_date,
            bo.delivery_date,
            bo.total_qty,
            bo.total_units,
            bd.model_name,
            bd.pl_dx,
            bd.lq_pc,
            bd.colours,
            bd.qty,
            bd.units,
            bd.box,
            bd.stc,
            bd.trims
        FROM blade_orders bo
        JOIN blade_order_details bd
            ON bo.id = bd.order_id
        WHERE bo.voucher_no = ?
        ORDER BY bd.id
    `;

    db.query(sql,[voucherNo],(err,result)=>{
        if(err){
            console.log(err);
            return res.status(500).json([]);
        }
        res.json(result);
    });

});

app.put('/api/update_blade_voucher/:voucher', (req,res)=>{

    const voucher = req.params.voucher;
    const { party_name, received_date, delivery_date, items } = req.body;

    // 1️⃣ Update main order table
    const updateOrderSql = `
        UPDATE blade_orders
        SET party_name = ?, received_date = ?, delivery_date = ?
        WHERE voucher_no = ?
    `;

    db.query(updateOrderSql, [party_name, received_date, delivery_date, voucher], (err)=>{
        if(err){
            console.error(err);
            return res.status(500).send("Error updating order");
        }

        // 2️⃣ Get order id
        db.query(`SELECT id FROM blade_orders WHERE voucher_no = ?`, [voucher], (err, orderResult)=>{
            if(err) return res.status(500).send("Error fetching order id");

            const orderId = orderResult[0].id;

            // 3️⃣ Delete old details
            db.query(`DELETE FROM blade_order_details WHERE order_id = ?`, [orderId], (err)=>{
                if(err) return res.status(500).send("Error deleting old items");

                // 4️⃣ Insert new details
                const insertSql = `
                    INSERT INTO blade_order_details
                    (order_id, model_name, pl_dx, lq_pc, colours, qty, units, box, stc, trims)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                let completed = 0;
                let hasError = false;

                if (items.length === 0) {
                    return res.json({ message: "Updated successfully" });
                }

                items.forEach(item => {
                    db.run(insertSql,
                        [orderId, item.model_name, item.pl_dx, item.lq_pc, item.colours,
                         item.qty, item.units, item.box, item.stc, item.trims],
                        function(err) {
                            if (err && !hasError) {
                                hasError = true;
                                console.error(err);
                                return res.status(500).send("Error inserting updated items");
                            }
                            completed++;
                            if (completed === items.length && !hasError) {
                                res.json({ message: "Updated successfully" });
                            }
                        }
                    );
                });
            });
        });
    });
});

// Get All
app.get('/api/blade_boxes', (req,res)=>{
    db.query("SELECT * FROM blade_box_master ORDER BY box_name", (err,result)=>{
        if(err) return res.status(500).send("Error");
        res.json(result);
    });
});

// Add
app.post('/api/blade_boxes', (req,res)=>{
    const { box_name } = req.body;
    db.query("INSERT INTO blade_box_master (box_name) VALUES (?)",[box_name],(err)=>{
        if(err) return res.status(500).send("Error");
        res.json({message:"Box Added"});
    });
});

// Delete
app.delete('/api/blade_boxes/:id',(req,res)=>{
    db.query("DELETE FROM blade_box_master WHERE id=?",[req.params.id],(err)=>{
        if(err) return res.status(500).send("Error");
        res.json({message:"Deleted"});
    });
});

app.get('/api/blade_stc',(req,res)=>{
    db.query("SELECT * FROM blade_stc_master ORDER BY stc_name",(err,result)=>{
        if(err) return res.status(500).send("Error");
        res.json(result);
    });
});

app.post('/api/blade_stc',(req,res)=>{
    const { stc_name } = req.body;
    db.query("INSERT INTO blade_stc_master (stc_name) VALUES (?)",[stc_name],(err)=>{
        if(err) return res.status(500).send("Error");
        res.json({message:"STC Added"});
    });
});

app.delete('/api/blade_stc/:id',(req,res)=>{
    db.query("DELETE FROM blade_stc_master WHERE id=?",[req.params.id],(err)=>{
        if(err) return res.status(500).send("Error");
        res.json({message:"Deleted"});
    });
});

app.get('/api/blade_trims',(req,res)=>{
    db.query("SELECT * FROM blade_trims_master ORDER BY trims_name",(err,result)=>{
        if(err) return res.status(500).send("Error");
        res.json(result);
    });
});

app.post('/api/blade_trims',(req,res)=>{
    const { trims_name } = req.body;
    db.query("INSERT INTO blade_trims_master (trims_name) VALUES (?)",[trims_name],(err)=>{
        if(err) return res.status(500).send("Error");
        res.json({message:"Trims Added"});
    });
});

app.delete('/api/blade_trims/:id',(req,res)=>{
    db.query("DELETE FROM blade_trims_master WHERE id=?",[req.params.id],(err)=>{
        if(err) return res.status(500).send("Error");
        res.json({message:"Deleted"});
    });
});

app.put('/api/blade_boxes/:id', (req,res)=>{
    const { box_name } = req.body;
    db.query(
        "UPDATE blade_box_master SET box_name=? WHERE id=?",
        [box_name, req.params.id],
        (err)=>{
            if(err) return res.status(500).send("Error updating");
            res.json({message:"Updated"});
        }
    );
});

app.put('/api/blade_stc/:id', (req,res)=>{
    const { stc_name } = req.body;
    db.query(
        "UPDATE blade_stc_master SET stc_name=? WHERE id=?",
        [stc_name, req.params.id],
        (err)=>{
            if(err) return res.status(500).send("Error updating");
            res.json({message:"Updated"});
        }
    );
});

app.put('/api/blade_trims/:id', (req,res)=>{
    const { trims_name } = req.body;
    db.query(
        "UPDATE blade_trims_master SET trims_name=? WHERE id=?",
        [trims_name, req.params.id],
        (err)=>{
            if(err) return res.status(500).send("Error updating");
            res.json({message:"Updated"});
        }
    );
});

/* =========================
   DELETE COVER ORDER
========================= */
app.delete('/api/delete_cover/:id', (req, res) => {
    const id = req.params.id;

    db.query("DELETE FROM cover_order_details WHERE order_id=?", [id], (err) => {
        if (err) return res.status(500).json(err);

        db.query("DELETE FROM cover_orders WHERE id=?", [id], (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Deleted successfully" });
        });
    });
});

app.put('/api/update_cover/:id', (req,res)=>{

    const id=req.params.id
    const {received_date,delivery_date,party_id,items}=req.body
    
    db.query(
    "UPDATE cover_orders SET received_date=?,delivery_date=?,party_id=? WHERE id=?",
    [received_date,delivery_date,party_id,id],
    (err)=>{
    
    if(err) return res.status(500).json(err)
    
    db.query(
    "DELETE FROM cover_order_details WHERE order_id=?",
    [id],
    (err)=>{
    
    if(err) return res.status(500).json(err)

    const insertSql = `
    INSERT INTO cover_order_details
    (order_id,model_id,pl_dx,lq_pc,colours,qty,units)
    VALUES (?,?,?,?,?,?,?)
    `;

    let completed = 0;
    let hasError = false;

    if (items.length === 0) {
        return res.json({ message: "Updated" });
    }

    items.forEach(i => {
        db.run(insertSql,
            [id, i.model_id, i.pl_dx, i.lq_pc, i.colours, i.qty, i.units],
            function(err) {
                if (err && !hasError) {
                    hasError = true;
                    return res.status(500).json(err);
                }
                completed++;
                if (completed === items.length && !hasError) {
                    res.json({ message: "Updated" });
                }
            }
        );
    });

    })
    
    })

})

app.get('/api/cover_report', (req,res)=>{

    const {from,to}=req.query
    
    const sql=`
    SELECT
    co.id,
    co.received_date,
    co.delivery_date,

    /* FIXED PARTY JOIN */
    COALESCE(p.party_name, co.party_id) AS party_name,

    /* FIXED MODEL JOIN */
    COALESCE(m.model_name, cod.model_id) AS model_name,

    cod.pl_dx,
    cod.lq_pc,
    cod.colours,
    cod.qty,
    cod.units

    FROM cover_orders co

    JOIN cover_order_details cod 
        ON co.id=cod.order_id

    LEFT JOIN model_name m 
        ON cod.model_id=m.id 
        OR cod.model_id=m.model_name

    LEFT JOIN party_name p 
        ON co.party_id=p.id 
        OR co.party_id=p.party_name

    WHERE date(co.received_date) BETWEEN ? AND ?

    ORDER BY co.id DESC
    `
    
    db.all(sql,[from,to],(err,rows)=>{
        if(err) return res.status(500).json(err)
        res.json(rows)
    })
    
})

    app.put('/api/blade_models/:id', (req, res) => {

        const id = req.params.id;
        const { model_name } = req.body;
        
        const sql = `
        UPDATE blade_models
        SET model_name = ?
        WHERE id = ?
        `;
        
        db.run(sql, [model_name, id], function(err){
        
        if(err){
        console.log(err);
        return res.status(500).json({error:"Update failed"});
        }
        
        res.json({message:"Model updated successfully"});
        
        });
        
        });

        app.post('/save_blade', (req, res) => {

            const data = req.body;
            
            const sqlOrder = `
            INSERT INTO blade_orders
            (party_name, received_date, delivery_date, total_qty, total_units)
            VALUES (?, ?, ?, ?, ?)
            `;
            
            db.run(sqlOrder, [
            data.party_name,
            data.received_date,
            data.delivery_date,
            data.total_qty,
            data.total_units
            ], function(err){
            
            if(err){
            console.log(err);
            return res.status(500).json({message:"Order save failed"});
            }
            
            const orderId = this.lastID;
            
            const sqlDetail = `
            INSERT INTO blade_order_details
            (order_id, model_name, pl_dx, lq_pc, colours, qty, units, box, stc, trims)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            data.items.forEach(item => {
            
            db.run(sqlDetail, [
            orderId,
            item.model_name,
            item.pl_dx,
            item.lq_pc,
            item.colours,
            item.qty,
            item.units,
            item.box,
            item.stc,
            item.trims
            ]);
            
            });
            
            res.json({message:"Blade Order Saved Successfully"});
            
            });
            
            });

            app.post('/api/blade_models',(req,res)=>{

                const {model_name}=req.body;
                
                db.run(
                "INSERT INTO blade_models (model_name) VALUES (?)",
                [model_name],
                function(err){
                
                if(err) return res.status(500).json(err);
                
                res.json({message:"Model added"});
                
                });
                
                });

                app.delete('/api/blade_models/:id',(req,res)=>{

                    const id=req.params.id;
                    
                    db.run(
                    "DELETE FROM blade_models WHERE id=?",
                    [id],
                    function(err){
                    
                    if(err) return res.status(500).json(err);
                    
                    res.json({message:"Model deleted"});
                    
                    });
                    
                    });
                    
                    app.delete('/api/blade_parties/:id',(req,res)=>{
                    
                    const id=req.params.id;
                    
                    db.run(
                    "DELETE FROM blade_parties WHERE id=?",
                    [id],
                    function(err){
                    
                    if(err) return res.status(500).json(err);
                    
                    res.json({message:"Party deleted"});
                    
                    });
                    
                    });
                    
                    app.delete('/api/box/:id',(req,res)=>{
                    
                    const id=req.params.id;
                    
                    db.run(
                    "DELETE FROM blade_box_master WHERE id=?",
                    [id],
                    function(err){
                    
                    if(err) return res.status(500).json(err);
                    
                    res.json({message:"BOX deleted"});
                    
                    });
                    
                    });
                    
                    app.delete('/api/stc/:id',(req,res)=>{
                    
                    const id=req.params.id;
                    
                    db.run(
                    "DELETE FROM blade_stc_master WHERE id=?",
                    [id],
                    function(err){
                    
                    if(err) return res.status(500).json(err);
                    
                    res.json({message:"STC deleted"});
                    
                    });
                    
                    });
                    app.get("/api/cover_report_lq", (req, res) => {

                        const { from, to } = req.query;
                    
                        const sql = `
                            SELECT 
                                co.id,
                                co.received_date,
                                co.delivery_date,
                                pn.party_name,
                                mn.model_name,
                                cod.pl_dx,
                                cod.lq_pc,
                                cod.colours,
                                cod.qty,
                                cod.units
                            FROM cover_orders co
                            JOIN cover_order_details cod 
                                ON co.id = cod.order_id
                            LEFT JOIN model_name mn
                                ON cod.model_id = mn.id
                            LEFT JOIN party_name pn
                                ON co.party_id = pn.id
                            WHERE substr(co.received_date,1,10) BETWEEN ? AND ?
                            AND TRIM(cod.lq_pc) = 'LQ'
                            ORDER BY co.id DESC
                        `;
                    
                        db.all(sql, [from, to], (err, rows) => {
                    
                            if (err) {
                                console.log(err);
                                return res.status(500).json(err);
                            }
                    
                            const grouped = {};
                    
                            rows.forEach(row => {
                    
                                if (!grouped[row.id]) {
                                    grouped[row.id] = {
                                        voucher_no: row.id,
                                        received_date: row.received_date,
                                        delivery_date: row.delivery_date,
                                        party_name: row.party_name || "",
                                        entries: []
                                    };
                                }
                    
                                grouped[row.id].entries.push({
                                    model_name: row.model_name || "",
                                    pl_dx: row.pl_dx,
                                    lq_pc: row.lq_pc,
                                    colours: row.colours,
                                    qty: row.qty,
                                    units: row.units
                                });
                    
                            });
                    
                            res.json(Object.values(grouped));
                    
                        });
                    
                    });
                    app.get("/debug_tables", (req, res) => {
                        db.all("SELECT name FROM sqlite_master WHERE type='table';", [], (err, rows) => {
                            if (err) return res.status(500).json(err);
                            res.json(rows);
                        });
                    });
                            

                    app.get("/debug_models_structure", (req, res) => {
                        db.all("PRAGMA table_info(models);", [], (err, rows) => {
                            if (err) return res.status(500).json(err);
                            res.json(rows);
                        });
                    });
                    app.get("/debug_dates", (req, res) => {

                        const sql = `SELECT received_date FROM cover_painting LIMIT 5`;
                    
                        db.all(sql, [], (err, rows) => {
                            if (err) return res.status(500).json(err);
                            res.json(rows);
                        });
                    
                    });

                    app.get("/debug_cover_orders_structure", (req, res) => {

                        db.all("PRAGMA table_info(cover_orders);", [], (err, rows) => {
                            if (err) return res.status(500).json(err);
                            res.json(rows);
                        });
                    
                    });
                    app.get("/debug_cover_order_details_structure", (req, res) => {
                        db.all("PRAGMA table_info(cover_order_details);", [], (err, rows) => {
                            if (err) return res.status(500).json(err);
                            res.json(rows);
                        });
                    });

                    app.get("/debug_all_cover", (req, res) => {

                        db.all("SELECT id, voucher_no, received_date FROM cover_painting", [], (err, rows) => {
                            if (err) return res.status(500).json(err);
                            res.json(rows);
                        });
                    
                    });

                    app.get("/api/cover_report_pc", (req, res) => {

                        const { from, to } = req.query;
                    
                        const sql = `
                            SELECT 
                                co.id,
                                co.received_date,
                                co.delivery_date,
                                mn.model_name,
                                cod.pl_dx,
                                cod.lq_pc,
                                cod.colours,
                                cod.qty,
                                cod.units
                            FROM cover_orders co
                            JOIN cover_order_details cod 
                                ON co.id = cod.order_id
                            LEFT JOIN model_name mn
                                ON cod.model_id = mn.id
                            WHERE substr(co.received_date,1,10) BETWEEN ? AND ?
                            AND TRIM(cod.lq_pc) = 'PC'
                            ORDER BY co.id DESC
                        `;
                    
                        db.all(sql, [from, to], (err, rows) => {
                    
                            if (err) {
                                console.log(err);
                                return res.status(500).json(err);
                            }
                    
                            const grouped = {};
                    
                            rows.forEach(row => {
                    
                                if (!grouped[row.id]) {
                                    grouped[row.id] = {
                                        voucher_no: row.id,
                                        received_date: row.received_date,
                                        delivery_date: row.delivery_date,
                                        entries: []
                                    };
                                }
                    
                                grouped[row.id].entries.push({
                                    model_name: row.model_name || "",
                                    pl_dx: row.pl_dx,
                                    lq_pc: row.lq_pc,
                                    colours: row.colours,
                                    qty: row.qty,
                                    units: row.units
                                });
                    
                            });
                    
                            res.json(Object.values(grouped));
                        });
                    
                    });

                    app.get("/api/cover_report_pc", (req, res) => {

                        const { from, to } = req.query;
                    
                        const sql = `
                            SELECT 
                                co.id,
                                co.voucher_no,
                                co.received_date,
                                co.delivery_date,
                                co.party_name,
                                cod.model_name,
                                cod.pl_dx,
                                cod.lq_pc,
                                cod.colours,
                                cod.qty,
                                cod.units
                            FROM cover_orders co
                            JOIN cover_order_details cod 
                                ON co.id = cod.order_id
                            WHERE substr(co.received_date,1,10) BETWEEN ? AND ?
                            AND TRIM(cod.lq_pc) = 'PC'
                            ORDER BY co.id DESC
                        `;
                    
                        db.all(sql, [from, to], (err, rows) => {
                            if (err) return res.status(500).json(err);
                    
                            // Group by voucher
                            const grouped = {};
                    
                            rows.forEach(row => {
                    
                                if (!grouped[row.id]) {
                                    grouped[row.id] = {
                                        voucher_no: row.voucher_no,
                                        received_date: row.received_date,
                                        delivery_date: row.delivery_date,
                                        party_name: row.party_name,
                                        entries: []
                                    };
                                }
                    
                                grouped[row.id].entries.push(row);
                            });
                    
                            res.json(Object.values(grouped));
                        });
                    });

  // =====================================
// COVER COLOR MASTER (CLEAN VERSION)
// =====================================

// =====================================
// COVER COLOR MASTER
// =====================================

// Get All Colors
app.get('/api/get_colors', (req, res) => {

    db.query(
        "SELECT * FROM cover_colors ORDER BY id DESC",
        (err, rows) => {

            if (err) {
                console.log(err);
                return res.status(500).json(err);
            }

            res.json(rows);
        }
    );
});

// Add Color
app.post('/api/add_color', (req, res) => {

    const { color_name } = req.body;

    if (!color_name) {
        return res.status(400).json({ error: "Color required" });
    }

    db.query(
        "INSERT INTO cover_colors (color_name) VALUES (?)",
        [color_name],
        (err) => {

            if (err) {
                console.log(err);
                return res.status(500).json({ error: "Insert failed" });
            }

            res.json({ message: "Saved" });
        }
    );
});

// Update Color
app.put('/api/update_color/:id', (req, res) => {

    const { color_name } = req.body;

    db.query(
        "UPDATE cover_colors SET color_name=? WHERE id=?",
        [color_name, req.params.id],
        (err) => {

            if (err) return res.status(500).json(err);

            res.json({ message: "Updated" });
        }
    );
});

// Delete Color
app.delete('/api/delete_color/:id', (req, res) => {

    db.query(
        "DELETE FROM cover_colors WHERE id=?",
        [req.params.id],
        (err) => {

            if (err) return res.status(500).json(err);

            res.json({ message: "Deleted" });
        }
    );
});

// Search Color
app.get('/api/search_colors', (req, res) => {

    const search = req.query.search || "";

    db.query(
        "SELECT * FROM cover_colors WHERE color_name LIKE ?",
        [`%${search}%`],
        (err, rows) => {

            if (err) return res.status(500).json(err);

            res.json(rows);
        }
    );
});



// =====================================
// COVER PL/DX MASTER
// =====================================

app.get('/api/get_pldx', (req, res) => {
    db.query(
        "SELECT id, pldx_name FROM cover_pldx ORDER BY id DESC",
        [],
        (err, rows) => {
            if (err) return res.status(500).json(err);
            res.json(rows);
        }
    );
});

app.post('/api/add_pldx', (req, res) => {
    const { pldx_name } = req.body;

    db.query(
        "INSERT INTO cover_pldx (pldx_name) VALUES (?)",
        [pldx_name],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Saved" });
        }
    );
});

app.put('/api/update_pldx/:id', (req, res) => {
    const { pldx_name } = req.body;

    db.query(
        "UPDATE cover_pldx SET pldx_name=? WHERE id=?",
        [pldx_name, req.params.id],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Updated" });
        }
    );
});

app.delete('/api/delete_pldx/:id', (req, res) => {
    db.query(
        "DELETE FROM cover_pldx WHERE id=?",
        [req.params.id],
        (err) => {
            if (err) return res.status(500).json(err);
            res.json({ message: "Deleted" });
        }
    );
});

app.get('/api/search_pldx', (req, res) => {
    const search = req.query.search || "";

    db.query(
        "SELECT id, pldx_name FROM cover_pldx WHERE pldx_name LIKE ?",
        [`%${search}%`],
        (err, rows) => {
            if (err) return res.status(500).json(err);
            res.json(rows);
        }
    );
});

/* =====================================
COVER LQ / PC MASTER
===================================== */

// GET ALL
app.get('/api/get_lqpc', (req, res) => {


    db.query(
        "SELECT * FROM cover_lqpc ORDER BY id DESC",
        [],
        (err, rows) => {
    
            if (err) {
                console.log(err);
                return res.status(500).json(err);
            }
    
            res.json(rows);
        }
    );
    
    
    });
    
    // ADD
    app.post('/api/add_lqpc', (req, res) => {
    

    const lqpc_name = req.body.lqpc_name;
    
    if (!lqpc_name) {
        return res.status(400).json({ error: "Value required" });
    }
    
    db.query(
        "INSERT INTO cover_lqpc (lqpc_name) VALUES (?)",
        [lqpc_name],
        (err) => {
    
            if (err) {
                console.log(err);
                return res.status(500).json(err);
            }
    
            res.json({ message: "Saved" });
        }
    );
    
    
    });
    
    // UPDATE
    app.put('/api/update_lqpc/:id', (req, res) => {
    
    
    const lqpc_name = req.body.lqpc_name;
    
    db.query(
        "UPDATE cover_lqpc SET lqpc_name=? WHERE id=?",
        [lqpc_name, req.params.id],
        (err) => {
    
            if (err) {
                console.log(err);
                return res.status(500).json(err);
            }
    
            res.json({ message: "Updated" });
        }
    );
    
    
    });
    
    // DELETE
    app.delete('/api/delete_lqpc/:id', (req, res) => {


    db.query(
        "DELETE FROM cover_lqpc WHERE id=?",
        [req.params.id],
        (err) => {
    
            if (err) {
                console.log(err);
                return res.status(500).json(err);
            }
    
            res.json({ message: "Deleted" });
        }
    );

    
    });
    
    // SEARCH
    app.get('/api/search_lqpc', (req, res) => {
    
    
    const search = req.query.search || "";
    
    db.query(
        "SELECT * FROM cover_lqpc WHERE lqpc_name LIKE ?",
        ["%" + search + "%"],
        (err, rows) => {
    
            if (err) {
                console.log(err);
                return res.status(500).json(err);
            }
    
            res.json(rows);
        }
    );
    
    
    });

    //====================================================================================
    app.get('/api/party_names', (req, res) => {
        db.query("SELECT * FROM party_name ORDER BY party_name ASC", (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        });
    });
    
    app.get('/api/models', (req, res) => {
        db.query("SELECT * FROM model_name ORDER BY model_name ASC", (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        });
    });

    app.get('/api/pldx', (req, res) => {
        db.query("SELECT * FROM cover_pldx ORDER BY pldx_name ASC", (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        });
    });

    app.get('/api/lqpc', (req, res) => {
        db.query("SELECT * FROM cover_lqpc ORDER BY lqpc_name ASC", (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        });
    });



    app.get('/api/colors', (req, res) => {
        db.query("SELECT * FROM cover_colors ORDER BY color_name ASC", (err, result) => {
            if (err) return res.status(500).json(err);
            res.json(result);
        });
    });

    app.post('/api/add_cover_voucher', (req, res) => {

        const { received_date, delivery_date, party_name, items } = req.body;
    
        if (!items || items.length === 0) {
            return res.status(400).json({ message: "No items found" });
        }
    
        db.serialize(() => {
    
            db.run(
                `INSERT INTO cover_orders (received_date, delivery_date, party_id)
                 VALUES (?, ?, ?)`,
                [received_date, delivery_date, party_name],
                function(err) {
    
                    if (err) {
                        console.log("MASTER INSERT ERROR:", err);
                        return res.status(500).json({ message: "Order insert failed" });
                    }
    
                    const orderId = this.lastID;   // 🔥 VERY IMPORTANT
    
                    const stmt = db.prepare(
                        `INSERT INTO cover_order_details
                         (order_id, model_id, pl_dx, lq_pc, colours, qty, units)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`
                    );
    
                    items.forEach(item => {
    
                        stmt.run(
                            orderId,
                            item.model,
                            item.pldx,
                            item.lqpc,
                            item.color,
                            item.qty,
                            item.units,
                            function(err) {
                                if (err) {
                                    console.log("DETAIL INSERT ERROR:", err);
                                }
                            }
                        );
    
                    });
    
                    stmt.finalize((err) => {
                        if (err) {
                            console.log("FINALIZE ERROR:", err);
                            return res.status(500).json({ message: "Detail insert failed" });
                        }
    
                        res.json({ message: "Voucher Saved Successfully" });
                    });
    
                }
            );
    
        });
    
    });

    app.delete('/api/delete_voucher/:id', (req, res) => {

        const id = req.params.id;
        
        db.serialize(() => {
        
        db.run("DELETE FROM cover_order_details WHERE order_id = ?", [id]);
        
        db.run("DELETE FROM cover_orders WHERE id = ?", [id], function(err){
        
        if(err){
        console.log(err);
        return res.status(500).json({error:"Delete failed"});
        }
        
        res.json({message:"Voucher deleted successfully"});
        
        });
        
        });
        
        });

//============================================================================================================
/* COLOURS MASTER */

/* GET colours */

app.get("/api/colours",(req,res)=>{

    db.all("SELECT * FROM colours ORDER BY name",(err,rows)=>{
    
    if(err){
    res.status(500).json(err)
    return
    }
    
    res.json(rows)
    
    })
    
    })
    
    
    /* ADD colour */
    
    app.post("/api/colours",(req,res)=>{
    
    const {name}=req.body
    
    db.run(
    "INSERT INTO colours(name) VALUES(?)",
    [name],
    function(err){
    
    if(err){
    res.status(500).json(err)
    return
    }
    
    res.json({id:this.lastID})
    
    })
    
    })
    
    
    /* UPDATE colour */
    
    app.put("/api/colours/:id",(req,res)=>{
    
    const {name}=req.body
    const id=req.params.id
    
    db.run(
    "UPDATE colours SET name=? WHERE id=?",
    [name,id],
    function(err){
    
    if(err){
    res.status(500).json(err)
    return
    }
    
    res.json({updated:this.changes})
    
    })
    
    })
    
    
    /* DELETE colour */
    
    app.delete("/api/colours/:id",(req,res)=>{
    
    const id=req.params.id
    
    db.run(
    "DELETE FROM colours WHERE id=?",
    [id],
    function(err){
    
    if(err){
    res.status(500).json(err)
    return
    }
    
    res.json({deleted:this.changes})
    
    })
    
    })

    /* =========================
   BLADE PL/DX MASTER
========================= */

/* GET ALL */

app.get('/api/blade_pldx', (req,res)=>{

    db.query(
        "SELECT * FROM blade_pldx ORDER BY pldx_name",
        (err,result)=>{
            if(err) return res.status(500).json(err);
            res.json(result);
        }
    );

});

/* ADD */

app.post('/api/blade_pldx',(req,res)=>{

    const { pldx_name } = req.body;

    db.query(
        "INSERT INTO blade_pldx (pldx_name) VALUES (?)",
        [pldx_name],
        (err)=>{
            if(err) return res.status(500).json(err);
            res.json({message:"Saved"});
        }
    );

});

/* UPDATE */

app.put('/api/blade_pldx/:id',(req,res)=>{

    const { pldx_name } = req.body;

    db.query(
        "UPDATE blade_pldx SET pldx_name=? WHERE id=?",
        [pldx_name, req.params.id],
        (err)=>{
            if(err) return res.status(500).json(err);
            res.json({message:"Updated"});
        }
    );

});

/* DELETE */

app.delete('/api/blade_pldx/:id',(req,res)=>{

    db.query(
        "DELETE FROM blade_pldx WHERE id=?",
        [req.params.id],
        (err)=>{
            if(err) return res.status(500).json(err);
            res.json({message:"Deleted"});
        }
    );

});
/* =========================
   BLADE LQ / PC MASTER
========================= */

/* GET ALL */

app.get('/api/blade_lqpc', (req,res)=>{

    db.query(
        "SELECT * FROM blade_lqpc ORDER BY lqpc_name",
        (err,result)=>{
            if(err) return res.status(500).json(err);
            res.json(result);
        }
    );

});

/* ADD */

app.post('/api/blade_lqpc',(req,res)=>{

    const { lqpc_name } = req.body;

    db.query(
        "INSERT INTO blade_lqpc (lqpc_name) VALUES (?)",
        [lqpc_name],
        (err)=>{
            if(err) return res.status(500).json(err);
            res.json({message:"Saved"});
        }
    );

});

/* UPDATE */

app.put('/api/blade_lqpc/:id',(req,res)=>{

    const { lqpc_name } = req.body;

    db.query(
        "UPDATE blade_lqpc SET lqpc_name=? WHERE id=?",
        [lqpc_name, req.params.id],
        (err)=>{
            if(err) return res.status(500).json(err);
            res.json({message:"Updated"});
        }
    );

});

/* DELETE */

app.delete('/api/blade_lqpc/:id',(req,res)=>{

    db.query(
        "DELETE FROM blade_lqpc WHERE id=?",
        [req.params.id],
        (err)=>{
            if(err) return res.status(500).json(err);
            res.json({message:"Deleted"});
        }
    );

});
    

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`🌐 Also accessible at http://127.0.0.1:${PORT}`);
})