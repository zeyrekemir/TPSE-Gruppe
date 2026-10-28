"""initial schema

Revision ID: c8c9c94128e1
Revises: 
Create Date: 2026-10-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c8c9c94128e1'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(length=64), nullable=False),
    sa.Column('display_name', sa.String(length=128), nullable=False),
    sa.Column('email', sa.String(length=256), nullable=True),
    sa.Column('password_hash', sa.String(length=128), nullable=True),
    sa.Column('role', sa.Enum('admin', 'member', name='role', native_enum=False, length=32), nullable=False),
    sa.Column('auth_source', sa.Enum('local', 'ldap', 'oidc', name='authsource', native_enum=False, length=32), nullable=False),
    sa.Column('language', sa.String(length=2), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_username'), ['username'], unique=True)

    op.create_table('robots',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=128), nullable=False),
    sa.Column('type', sa.String(length=128), nullable=False),
    sa.Column('location', sa.String(length=128), nullable=False),
    sa.Column('responsible_user_id', sa.Integer(), nullable=True),
    sa.Column('documentation_url', sa.String(length=512), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('available', 'maintenance', 'defect', 'retired', name='robotstatus', native_enum=False, length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('api_key_hash', sa.String(length=64), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('live_state', sa.String(length=32), nullable=True),
    sa.Column('live_message', sa.String(length=256), nullable=True),
    sa.Column('battery', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['responsible_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('experiment_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('robot_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('title', sa.String(length=256), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('result', sa.Enum('success', 'partial', 'failure', name='experimentresult', native_enum=False, length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['robot_id'], ['robots.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('experiment_logs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_experiment_logs_date'), ['date'], unique=False)
        batch_op.create_index(batch_op.f('ix_experiment_logs_robot_id'), ['robot_id'], unique=False)

    op.create_table('reservations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('robot_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('start', sa.DateTime(timezone=True), nullable=False),
    sa.Column('end', sa.DateTime(timezone=True), nullable=False),
    sa.Column('purpose', sa.String(length=512), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('reminder_sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['robot_id'], ['robots.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('reservations', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_reservations_end'), ['end'], unique=False)
        batch_op.create_index(batch_op.f('ix_reservations_robot_id'), ['robot_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_reservations_start'), ['start'], unique=False)

    op.create_table('tickets',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('robot_id', sa.Integer(), nullable=False),
    sa.Column('reporter_id', sa.Integer(), nullable=False),
    sa.Column('assignee_id', sa.Integer(), nullable=True),
    sa.Column('kind', sa.Enum('maintenance', 'fault', name='ticketkind', native_enum=False, length=32), nullable=False),
    sa.Column('title', sa.String(length=256), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('open', 'in_progress', 'resolved', name='ticketstatus', native_enum=False, length=32), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['robot_id'], ['robots.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('tickets', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tickets_robot_id'), ['robot_id'], unique=False)

    op.create_table('ticket_events',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('ticket_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('old_status', sa.Enum('open', 'in_progress', 'resolved', name='ticketstatus', native_enum=False, length=32), nullable=True),
    sa.Column('new_status', sa.Enum('open', 'in_progress', 'resolved', name='ticketstatus', native_enum=False, length=32), nullable=True),
    sa.Column('comment', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('ticket_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_ticket_events_ticket_id'), ['ticket_id'], unique=False)

    


def downgrade() -> None:
    """Downgrade schema."""
    
    with op.batch_alter_table('ticket_events', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_ticket_events_ticket_id'))

    op.drop_table('ticket_events')
    with op.batch_alter_table('tickets', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tickets_robot_id'))

    op.drop_table('tickets')
    with op.batch_alter_table('reservations', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_reservations_start'))
        batch_op.drop_index(batch_op.f('ix_reservations_robot_id'))
        batch_op.drop_index(batch_op.f('ix_reservations_end'))

    op.drop_table('reservations')
    with op.batch_alter_table('experiment_logs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_experiment_logs_robot_id'))
        batch_op.drop_index(batch_op.f('ix_experiment_logs_date'))

    op.drop_table('experiment_logs')
    op.drop_table('robots')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_username'))

    op.drop_table('users')
    
