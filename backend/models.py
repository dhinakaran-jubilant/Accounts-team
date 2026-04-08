"""
Project: Accounts Team
Module: models
Author: Dhinakaran Sekar
Email: dhinakaran.s@jubilantenterprises.in
Date: 2026-04-08 11:53:28
"""
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Loan(db.Model):
    __tablename__ = 'loans'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    loan_ref_id = db.Column(db.String(11), nullable=True)
    client_account_name = db.Column(db.String(255), nullable=False)
    loan_amount = db.Column(db.Float, nullable=False)
    loan_date = db.Column(db.String(100), nullable=False)
    primary_account_amount = db.Column(db.Float, nullable=False)
    primary_account_name = db.Column(db.String(255), nullable=False)
    primary_account_share = db.Column(db.Float, nullable=False)
    primary_account_interest = db.Column(db.Float, nullable=False)
    total_repayment_amount = db.Column(db.Float, nullable=False)
    total_interest = db.Column(db.Float, nullable=False)
    is_deleted = db.Column(db.Boolean, default=False, nullable=False)
    
    # Relationships
    remaining_accounts = db.relationship('RemainingAccount', backref='loan', cascade="all, delete-orphan")
    repayment_schedule = db.relationship('RepaymentSchedule', backref='loan', cascade="all, delete-orphan", order_by="RepaymentSchedule.id")

class RemainingAccount(db.Model):
    __tablename__ = 'remaining_accounts'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False)
    account_name = db.Column(db.String(255), nullable=False)
    percentage = db.Column(db.Float, nullable=False)
    share = db.Column(db.Float, nullable=False)
    interest_amount = db.Column(db.Float, nullable=False)
    tds = db.Column(db.Float, nullable=False)

class RepaymentSchedule(db.Model):
    __tablename__ = 'repayment_schedule'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    loan_id = db.Column(db.Integer, db.ForeignKey('loans.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    interest_amount = db.Column(db.Float, nullable=True, default=0)
    cheque_no = db.Column(db.String(100), nullable=False)
    date = db.Column(db.String(100), nullable=False)
    received_date = db.Column(db.String(100), nullable=True)
    payment_date = db.Column(db.String(100), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    type = db.Column(db.String(50), default='system')
    splits = db.Column(db.Text, nullable=True)

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    employee_code = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(100), nullable=True)
    role = db.Column(db.String(50), default='admin')
    is_initial_password = db.Column(db.Boolean, default=True)
    email = db.Column(db.String(255), nullable=True)
    permissions = db.Column(db.Text, nullable=True) # JSON array of codes
    security_question = db.Column(db.String(255), nullable=True)
    security_answer = db.Column(db.String(255), nullable=True)
